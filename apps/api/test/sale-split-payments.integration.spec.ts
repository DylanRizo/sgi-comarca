import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';
import { SessionService } from '../src/auth/application/session.service.js';
import { createApplication } from '../src/bootstrap.js';
import { ClosingPreviewService } from '../src/finances/closing-preview.service.js';
import { CreateSaleService } from '../src/sales/create-sale.service.js';
import { SaleLifecycleService } from '../src/sales/sale-lifecycle.service.js';
import { SaleReadService } from '../src/sales/sale-read.service.js';
import { VoidDuplicateSaleService } from '../src/sales/void-duplicate-sale.service.js';

const originalUrl = process.env.DATABASE_URL!;
const databaseName = `sgi_split_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const key = () => randomUUID();
type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;
const split = {
  splitPayments: [
    { methodText: 'Efectivo', amount: '400' },
    { methodText: 'Transferencia', amount: '600.00' },
  ],
};

describe.sequential('ADR-022 full receipts with hybrid allocations', () => {
  let administrator: DatabaseClient;
  let client: DatabaseClient;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let dylan: string,
    jean: string,
    outsider: string,
    productId: string,
    warehouseId: string;
  let lifecycle: SaleLifecycleService, creation: CreateSaleService;
  let dateIndex = 0;
  beforeAll(async () => {
    const url = new URL(originalUrl);
    url.pathname = '/postgres';
    administrator = createDatabaseClient(url.toString());
    await administrator.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    url.pathname = `/${databaseName}`;
    process.env.DATABASE_URL = url.toString();
    await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            '../../../packages/database/node_modules/prisma/build/index.js',
            import.meta.url,
          ),
        ),
        'migrate',
        'deploy',
        '--config',
        fileURLToPath(
          new URL(
            '../../../packages/database/prisma.config.ts',
            import.meta.url,
          ),
        ),
      ],
      {
        cwd: fileURLToPath(
          new URL('../../../packages/database/', import.meta.url),
        ),
        env: process.env,
      },
    );
    client = createDatabaseClient(url.toString());
    await runBootstrap(client);
    await client.user.updateMany({
      data: { status: 'ACTIVE', activatedAt: new Date() },
    });
    dylan = (
      await client.user.findUniqueOrThrow({
        where: { loginIdentifier: 'dylan' },
      })
    ).id;
    jean = (
      await client.user.findUniqueOrThrow({
        where: { loginIdentifier: 'jean' },
      })
    ).id;
    outsider = (
      await client.user.create({
        data: {
          loginIdentifier: 'split-outsider',
          displayName: 'Synthetic read-only',
          status: 'ACTIVE',
          activatedAt: new Date(),
        },
      })
    ).id;
    productId = (
      await client.product.create({
        data: { code: 'SPLIT-SYNTHETIC', name: 'Synthetic product' },
      })
    ).id;
    warehouseId = (
      await client.warehouse.create({
        data: { code: 'SPLIT_TEST', name: 'Synthetic warehouse' },
      })
    ).id;
    await client.inventoryBalance.create({
      data: {
        productId,
        warehouseId,
        quantity: '1000',
        currentUnitCost: '50',
        currentUnitPrice: '1000',
      },
    });
    creation = new CreateSaleService(client);
    lifecycle = new SaleLifecycleService(client);
    app = await createApplication();
    await app.init();
  }, 120000);
  afterAll(async () => {
    if (app) await app.close();
    if (client) await client.$disconnect();
    if (administrator) {
      await administrator.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
      await administrator.$disconnect();
    }
    process.env.DATABASE_URL = originalUrl;
  });
  async function sale(
    price = '1000',
    businessDate = `2026-06-${String(++dateIndex).padStart(2, '0')}`,
  ) {
    return creation.create(jean, key(), {
      businessDate,
      status: 'COMPLETED',
      paymentMethodText: 'Efectivo',
      items: [{ productId, warehouseId, quantity: '1', unitPrice: price }],
    });
  }
  async function stock() {
    return (
      await client.inventoryBalance.findUniqueOrThrow({
        where: { productId_warehouseId: { productId, warehouseId } },
      })
    ).quantity.toString();
  }
  async function receipt(
    transaction: TransactionClient,
    saleId: string,
    total = '1000',
  ) {
    const id = key(),
      hash = createHash('sha256').update(id).digest('hex');
    return transaction.salePayment.create({
      data: {
        saleId,
        amount: total,
        currencyCode: 'NIO',
        methodText: 'Mixto',
        recordedByUserId: dylan,
        paidAt: new Date(),
        idempotencyKeyHash: hash,
        requestHash: hash,
      },
    });
  }
  it('records one full receipt and exact parts without inventory or duplicate income', async () => {
    const s = await sale(),
      before = await stock();
    const result = await lifecycle.recordPayment(dylan, s.id, split, key());
    expect(result.payment).toMatchObject({
      amount: '1000.00',
      methodText: 'Mixto',
    });
    expect(
      result.payments?.map((p) => ({ amount: p.amount, method: p.methodText })),
    ).toEqual([
      { amount: '400.00', method: 'Efectivo' },
      { amount: '600.00', method: 'Transferencia' },
    ]);
    expect(await client.salePayment.count({ where: { saleId: s.id } })).toBe(1);
    expect(
      await client.salePaymentPart.count({
        where: { paymentId: result.payment!.id },
      }),
    ).toBe(2);
    expect(await stock()).toBe(before);
    expect(await client.financialEntry.count()).toBe(0);
    const preview = await new ClosingPreviewService(client, '0.50').preview(
      s.businessDate,
    );
    expect(preview.bySeller).toEqual([
      expect.objectContaining({
        saleCount: 1,
        cashAmount: '400.00',
        digitalAmount: '600.00',
        totalAmount: '1000.00',
        unspecifiedAmount: '0.00',
      }),
    ]);
  });
  it('normalizes/replays the same split and rejects reusing its key for a different intent', async () => {
    const s = await sale(),
      idempotency = key();
    const first = await lifecycle.recordPayment(
      dylan,
      s.id,
      split,
      idempotency,
    );
    const replay = await lifecycle.recordPayment(
      dylan,
      s.id,
      {
        splitPayments: [
          { methodText: ' Efectivo ', amount: '400.00' },
          { methodText: 'Transferencia', amount: '600' },
        ],
      },
      idempotency,
    );
    expect(replay.payment).toEqual(first.payment);
    expect(replay.payments).toEqual(first.payments);
    await expect(
      lifecycle.recordPayment(
        dylan,
        s.id,
        { splitPayments: [{ methodText: 'Digital', amount: '1000' }] },
        idempotency,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(
      await client.salePaymentPart.count({
        where: { paymentId: first.payment!.id },
      }),
    ).toBe(2);
  });
  it('serializes concurrent actors/keys into one receipt, one set of parts and one audit', async () => {
    const s = await sale();
    const results = await Promise.all([
      lifecycle.recordPayment(dylan, s.id, split, key()),
      lifecycle.recordPayment(jean, s.id, split, key()),
    ]);
    expect(results[0].payment?.id).toBe(results[1].payment?.id);
    expect(await client.salePayment.count({ where: { saleId: s.id } })).toBe(1);
    expect(
      await client.salePaymentPart.count({
        where: { paymentId: results[0].payment!.id },
      }),
    ).toBe(2);
    expect(
      await client.auditLog.count({
        where: { entityId: s.id, action: 'sales.payment_recorded' },
      }),
    ).toBe(1);
  });
  it('rejects incorrect sums atomically with no receipt or balance write', async () => {
    const s = await sale(),
      before = await stock();
    await expect(
      lifecycle.recordPayment(
        dylan,
        s.id,
        { splitPayments: [{ methodText: 'Efectivo', amount: '999.99' }] },
        key(),
      ),
    ).rejects.toMatchObject({ code: 'SALE_SPLIT_PAYMENT_SUM_MISMATCH' });
    expect(await client.salePayment.count({ where: { saleId: s.id } })).toBe(0);
    expect(
      (await client.sale.findUniqueOrThrow({ where: { id: s.id } }))
        .paymentStatus,
    ).toBe('PENDING');
    expect(await stock()).toBe(before);
  });
  it('keeps old single-payment requests and zero-total sales compatible', async () => {
    const s = await sale('0');
    const result = await lifecycle.recordPayment(
      dylan,
      s.id,
      'Efectivo',
      key(),
    );
    expect(result.payment?.amount).toBe('0.00');
    expect(result.payments).toHaveLength(1);
    expect(
      await client.salePaymentPart.count({
        where: { paymentId: result.payment!.id },
      }),
    ).toBe(0);
  });
  it('refuses incomplete totals at commit, even outside the application', async () => {
    const s = await sale();
    await expect(
      client.$transaction(async (tx) => {
        const p = await receipt(tx, s.id);
        await tx.salePaymentPart.create({
          data: {
            paymentId: p.id,
            position: 1,
            amount: '400',
            methodText: 'Efectivo',
          },
        });
        await tx.sale.update({
          where: { id: s.id },
          data: { paymentStatus: 'PAID' },
        });
      }),
    ).rejects.toThrow();
    expect(await client.salePayment.count({ where: { saleId: s.id } })).toBe(0);
  });
  it('refuses committing a receipt without settling its sale', async () => {
    const s = await sale();
    await expect(
      client.$transaction((tx) => receipt(tx, s.id)),
    ).rejects.toThrow();
    expect(await client.salePayment.count({ where: { saleId: s.id } })).toBe(0);
  });
  it('prevents mutation/deletion/appending allocations after the receipt is paid', async () => {
    const s = await sale();
    const result = await lifecycle.recordPayment(dylan, s.id, split, key());
    const part = await client.salePaymentPart.findFirstOrThrow({
      where: { paymentId: result.payment!.id },
    });
    await expect(
      client.salePaymentPart.update({
        where: { id: part.id },
        data: { amount: '1' },
      }),
    ).rejects.toThrow();
    await expect(
      client.salePaymentPart.delete({ where: { id: part.id } }),
    ).rejects.toThrow();
    await expect(
      client.salePaymentPart.create({
        data: {
          paymentId: result.payment!.id,
          position: 3,
          methodText: 'Digital',
          amount: '1',
        },
      }),
    ).rejects.toThrow();
    expect(
      await client.salePaymentPart.count({
        where: { paymentId: result.payment!.id },
      }),
    ).toBe(2);
  });
  it('reassigns the same complete mixed receipt through ADR-021 without copying or losing parts', async () => {
    const source = await sale();
    const paid = await lifecycle.recordPayment(dylan, source.id, split, key());
    const target = await sale('1000', source.businessDate),
      before = await stock();
    const original = await client.salePayment.findUniqueOrThrow({
      where: { saleId: source.id },
      include: { parts: { orderBy: { position: 'asc' } } },
    });
    await new VoidDuplicateSaleService(client).execute(
      dylan,
      source.id,
      {
        replacementSaleNumber: target.saleNumber,
        reason: 'Synthetic duplicate with mixed payment',
        stockReturned: true,
      },
      key(),
    );
    const corrected = await new SaleReadService(client).get(target.id);
    expect(corrected.payment).toEqual(paid.payment);
    expect(corrected.payments).toEqual(paid.payments);
    expect(
      await client.salePayment.findUniqueOrThrow({
        where: { saleId: source.id },
        include: { parts: { orderBy: { position: 'asc' } } },
      }),
    ).toEqual(original);
    expect(Number(await stock()) - Number(before)).toBe(1);
    const preview = await new ClosingPreviewService(client, '0.50').preview(
      source.businessDate,
    );
    expect(preview.bySeller).toEqual([
      expect.objectContaining({
        saleCount: 1,
        cashAmount: '400.00',
        digitalAmount: '600.00',
        totalAmount: '1000.00',
      }),
    ]);
  });
  it('enforces private HTTP, CSRF, permissions, exact shape and typed amount errors', async () => {
    const s = await sale(),
      endpoint = `/api/v1/sales/${s.id}/payment`;
    const call = () =>
      request(app.getHttpServer())
        .post(endpoint)
        .set('Host', 'localhost:3001')
        .set('Origin', 'http://localhost:3000')
        .set('Idempotency-Key', key());
    expect((await call().send(split)).status).toBe(401);
    const cookie = `sgi_session=${(await app.get(SessionService).create(dylan)).revealOnce()}`;
    expect((await call().set('Cookie', cookie).send(split)).status).toBe(403);
    const csrf = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie);
    const authorized = () =>
      call()
        .set('Cookie', cookie)
        .set('X-CSRF-Token', String(csrf.body.data.csrfToken));
    for (const bad of [
      {},
      { paymentMethodText: 'Efectivo', ...split },
      { splitPayments: [] },
      { splitPayments: null },
      { splitPayments: [null] },
      { splitPayments: [{ methodText: ' ', amount: '1000' }] },
    ])
      expect((await authorized().send(bad)).status).toBe(400);
    for (const amount of ['0', '-1', '1.234', '1e3', '9999999999999999.99']) {
      const response = await authorized().send({
        splitPayments: [{ methodText: 'Digital', amount }],
      });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('SALE_PAYMENT_AMOUNT_INVALID');
    }
    await expect(
      lifecycle.recordPayment(outsider, s.id, split, key()),
    ).rejects.toMatchObject({ code: 'SALES_PERMISSION_DENIED' });
    const paid = await authorized().send(split);
    expect(paid.status).toBe(201);
    expect(paid.body.data.payments).toHaveLength(2);
    expect(JSON.stringify(paid.body)).not.toMatch(
      /unitCost|requestHash|idempotencyKeyHash/u,
    );
  });
});
