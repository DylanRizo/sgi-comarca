import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';
import { SessionService } from '../src/auth/application/session.service.js';
import { createApplication } from '../src/bootstrap.js';
import { ClosingPreviewService } from '../src/finances/closing-preview.service.js';
import {
  DailyClosingService,
  daySalesFigures,
} from '../src/finances/daily-closing.service.js';
import { CreateSaleService } from '../src/sales/create-sale.service.js';
import { SaleLifecycleService } from '../src/sales/sale-lifecycle.service.js';
import { SaleReadService } from '../src/sales/sale-read.service.js';
import { VoidDuplicateSaleService } from '../src/sales/void-duplicate-sale.service.js';

const originalUrl = process.env.DATABASE_URL!;
const databaseName = `sgi_salevoid_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const key = () => randomUUID();

describe.sequential('ADR-021 paid duplicate correction', () => {
  let administrator: DatabaseClient;
  let client: DatabaseClient;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let dylan: string;
  let jean: string;
  let creation: CreateSaleService;
  let lifecycle: SaleLifecycleService;
  let correction: VoidDuplicateSaleService;
  const closing = () =>
    new DailyClosingService(client, {
      tolerance: '0.50',
      reopeningWindowDays: 30,
    });
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
    creation = new CreateSaleService(client);
    lifecycle = new SaleLifecycleService(client);
    correction = new VoidDuplicateSaleService(client);
    app = await createApplication();
    await app.init();
  }, 120_000);

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

  async function pair(
    options: {
      sameProduct?: boolean;
      confirmed?: boolean;
      targetPrice?: string;
      targetDate?: string;
    } = {},
  ) {
    const businessDate = `2026-07-${String(++dateIndex).padStart(2, '0')}`;
    const warehouse = await client.warehouse.create({
      data: {
        code: `VOID_${key().replaceAll('-', '').toUpperCase()}`,
        name: 'Synthetic warehouse',
      },
    });
    const first = await client.product.create({
      data: {
        code: `VOID-${key().toUpperCase()}`,
        name: 'Synthetic mistaken item',
      },
    });
    const second = options.sameProduct
      ? first
      : await client.product.create({
          data: {
            code: `VOID-${key().toUpperCase()}`,
            name: 'Synthetic real item',
          },
        });
    for (const productId of new Set([first.id, second.id])) {
      await client.inventoryBalance.create({
        data: {
          productId,
          warehouseId: warehouse.id,
          quantity: '10.5',
          currentUnitCost: '2',
          currentUnitPrice: '10',
        },
      });
    }
    const source = await creation.create(jean, key(), {
      businessDate,
      items: [
        { productId: first.id, warehouseId: warehouse.id, quantity: '2.5' },
      ],
      status: options.confirmed ? 'IN_TRANSIT' : 'COMPLETED',
    });
    if (options.confirmed)
      await lifecycle.confirmInTransit(jean, source.id, key());
    const paid = await lifecycle.recordPayment(
      dylan,
      source.id,
      'Digital',
      key(),
    );
    const target = await creation.create(jean, key(), {
      businessDate: options.targetDate ?? businessDate,
      items: [
        {
          productId: second.id,
          warehouseId: warehouse.id,
          quantity: '2.5',
          ...(options.targetPrice ? { unitPrice: options.targetPrice } : {}),
        },
      ],
      status: 'COMPLETED',
    });
    return {
      source: paid,
      target,
      first,
      second,
      warehouse,
      businessDate,
      input: {
        replacementSaleNumber: target.saleNumber,
        reason: 'Synthetic wrong product; correct sale exists',
        stockReturned: true as const,
      },
    };
  }

  async function stock(productId: string, warehouseId: string) {
    return (
      await client.inventoryBalance.findUniqueOrThrow({
        where: { productId_warehouseId: { productId, warehouseId } },
      })
    ).quantity.toString();
  }

  it('restores only the mistaken item and resolves the ONE immutable payment on the real sale', async () => {
    const p = await pair();
    const originalPayment = await client.salePayment.findUniqueOrThrow({
      where: { saleId: p.source.id },
    });
    const beforeTarget = await client.sale.findUniqueOrThrow({
      where: { id: p.target.id },
    });
    const beforeSource = await client.sale.findUniqueOrThrow({
      where: { id: p.source.id },
    });
    const payments = await client.salePayment.count();
    const originalMovements = await client.inventoryMovement.findMany({
      where: {
        type: 'SALE',
        saleItem: { saleId: { in: [p.source.id, p.target.id] } },
      },
    });
    const result = await correction.execute(dylan, p.source.id, p.input, key());
    expect(result.status).toBe('CANCELLED');
    expect(result.completedAt).toBe(p.source.completedAt);
    expect(result.duplicateCorrection?.replacementSale.id).toBe(p.target.id);
    expect(await stock(p.first.id, p.warehouse.id)).toBe('10.5');
    expect(await stock(p.second.id, p.warehouse.id)).toBe('8');
    const replacement = await new SaleReadService(client).byNumber(
      p.target.saleNumber,
    );
    expect(replacement.paymentStatus).toBe('PAID');
    expect(replacement.payment).toEqual(p.source.payment);
    expect(await client.salePayment.count()).toBe(payments);
    expect(
      await client.salePayment.findUniqueOrThrow({
        where: { id: originalPayment.id },
      }),
    ).toEqual(originalPayment);
    expect(
      await client.sale.findUniqueOrThrow({ where: { id: p.target.id } }),
    ).toEqual({
      ...beforeTarget,
      paymentStatus: 'PAID',
      updatedAt: expect.any(Date),
    });
    expect(
      await client.sale.findUniqueOrThrow({ where: { id: p.source.id } }),
    ).toEqual({
      ...beforeSource,
      status: 'CANCELLED',
      updatedAt: expect.any(Date),
    });
    expect(
      await client.inventoryMovement.findMany({
        where: { id: { in: originalMovements.map((row) => row.id) } },
      }),
    ).toEqual(originalMovements);
    expect(
      await client.inventoryMovement.count({
        where: { type: 'SALE_CANCELLATION', saleItem: { saleId: p.source.id } },
      }),
    ).toBe(1);
    expect(
      Number((await daySalesFigures(client, p.businessDate)).systemSales),
    ).toBe(25);
    const preview = await new ClosingPreviewService(client, '0.50').preview(
      p.businessDate,
    );
    expect(preview.bySeller[0]?.digitalAmount).toBe('25.00');
    expect(await client.financialEntry.count()).toBe(0);
  });

  it('replays lost responses and new keys without duplicate stock, receipts or audits', async () => {
    const p = await pair();
    const intent = key();
    await correction.execute(dylan, p.source.id, p.input, intent);
    const movements = await client.inventoryMovement.count();
    const audits = await client.auditLog.count();
    await correction.execute(dylan, p.source.id, p.input, intent);
    await correction.execute(dylan, p.source.id, p.input, key());
    await lifecycle.recordPayment(jean, p.target.id, 'Digital', key());
    expect(await client.inventoryMovement.count()).toBe(movements);
    expect(await client.auditLog.count()).toBe(audits);
    await expect(
      correction.execute(
        dylan,
        p.source.id,
        { ...p.input, reason: 'Changed intention' },
        intent,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('preserves in-transit confirmation history and handles a shared product pair', async () => {
    const p = await pair({ confirmed: true, sameProduct: true });
    await correction.execute(dylan, p.source.id, p.input, key());
    expect(await stock(p.first.id, p.warehouse.id)).toBe('8');
    expect(
      await client.inTransitConfirmation.count({
        where: { saleId: p.source.id },
      }),
    ).toBe(1);
  });

  it('denies Jean and also denies a non-ADMIN with an accidental direct grant', async () => {
    const p = await pair();
    await expect(
      correction.execute(jean, p.source.id, p.input, key()),
    ).rejects.toMatchObject({ code: 'SALES_PERMISSION_DENIED' });
    const permission = await client.permission.findUniqueOrThrow({
      where: { code: 'sales.cancel' },
    });
    const grant = await client.userPermission.create({
      data: { userId: jean, permissionId: permission.id, effect: 'GRANT' },
    });
    try {
      await expect(
        correction.execute(jean, p.source.id, p.input, key()),
      ).rejects.toMatchObject({ code: 'SALES_PERMISSION_DENIED' });
    } finally {
      await client.userPermission.update({
        where: { id: grant.id },
        data: { revokedAt: new Date() },
      });
    }
  });

  it('honors direct DENY even for the sole ADMIN', async () => {
    const p = await pair();
    const permission = await client.permission.findUniqueOrThrow({
      where: { code: 'sales.cancel' },
    });
    await client.userPermission.updateMany({
      where: { userId: dylan, permissionId: permission.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const deny = await client.userPermission.create({
      data: { userId: dylan, permissionId: permission.id, effect: 'DENY' },
    });
    try {
      await expect(
        correction.execute(dylan, p.source.id, p.input, key()),
      ).rejects.toMatchObject({ code: 'SALES_PERMISSION_DENIED' });
    } finally {
      await client.userPermission.update({
        where: { id: deny.id },
        data: { revokedAt: new Date() },
      });
      await client.userPermission.create({
        data: { userId: dylan, permissionId: permission.id, effect: 'GRANT' },
      });
    }
  });

  it.each([{ targetPrice: '11' }, { targetDate: '2026-08-01' }])(
    'rejects mismatched replacement %j atomically',
    async (options) => {
      const p = await pair(options);
      await expect(
        correction.execute(dylan, p.source.id, p.input, key()),
      ).rejects.toMatchObject({ code: 'SALE_DUPLICATE_TARGET_INVALID' });
      expect(await stock(p.first.id, p.warehouse.id)).toBe('8');
      expect(
        await client.saleCancellation.count({ where: { saleId: p.source.id } }),
      ).toBe(0);
    },
  );

  it('rejects a replacement already paid, self-reference and a missing sale', async () => {
    const p = await pair();
    await expect(
      correction.execute(
        dylan,
        p.source.id,
        { ...p.input, replacementSaleNumber: p.source.saleNumber },
        key(),
      ),
    ).rejects.toMatchObject({ code: 'SALE_DUPLICATE_TARGET_INVALID' });
    await expect(
      correction.execute(
        dylan,
        p.source.id,
        { ...p.input, replacementSaleNumber: 'VTA-999999999' },
        key(),
      ),
    ).rejects.toMatchObject({ code: 'SALE_DUPLICATE_TARGET_INVALID' });
    await lifecycle.recordPayment(dylan, p.target.id, 'Digital', key());
    await expect(
      correction.execute(dylan, p.source.id, p.input, key()),
    ).rejects.toMatchObject({ code: 'SALE_DUPLICATE_TARGET_INVALID' });
  });

  it('requires stock confirmation, a reason and a valid idempotency key', async () => {
    const p = await pair();
    await expect(
      correction.execute(dylan, p.source.id, p.input, undefined),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    await expect(
      correction.execute(dylan, p.source.id, p.input, 'short'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_INVALID' });
    await expect(
      correction.execute(
        dylan,
        p.source.id,
        { ...p.input, reason: ' ' },
        key(),
      ),
    ).rejects.toMatchObject({ code: 'SALES_REQUEST_INVALID' });
    await expect(
      correction.execute(
        dylan,
        p.source.id,
        { ...p.input, stockReturned: false as unknown as true },
        key(),
      ),
    ).rejects.toMatchObject({ code: 'SALES_REQUEST_INVALID' });
  });

  it('serializes concurrent correction requests into one restoration and one reassignment', async () => {
    const p = await pair();
    const results = await Promise.all([
      correction.execute(dylan, p.source.id, p.input, key()),
      correction.execute(dylan, p.source.id, p.input, key()),
    ]);
    expect(results.every((sale) => sale.status === 'CANCELLED')).toBe(true);
    expect(await stock(p.first.id, p.warehouse.id)).toBe('10.5');
    expect(
      await client.auditLog.count({
        where: { action: 'sales.duplicate_voided', entityId: p.source.id },
      }),
    ).toBe(1);
    expect(
      await client.auditLog.count({
        where: { action: 'sales.payment_reassigned', entityId: p.target.id },
      }),
    ).toBe(1);
  });

  it('races collecting the replacement without ever creating two effective payments', async () => {
    const p = await pair();
    const before = await client.salePayment.count();
    const results = await Promise.allSettled([
      correction.execute(dylan, p.source.id, p.input, key()),
      lifecycle.recordPayment(jean, p.target.id, 'Digital', key()),
    ]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    const doc = await client.saleCancellation.findUnique({
      where: { saleId: p.source.id },
    });
    expect(await client.salePayment.count()).toBe(before + (doc ? 0 : 1));
    expect(await stock(p.first.id, p.warehouse.id)).toBe(doc ? '10.5' : '8');
  });

  it('refuses an already closed day and never changes its frozen figures', async () => {
    const p = await pair();
    const closed = await closing().create(dylan, key(), {
      businessDate: p.businessDate,
      realCash: '0',
      realDigital: '50',
    });
    const snapshot = await client.dailyClosing.findUniqueOrThrow({
      where: { id: closed.id },
    });
    await expect(
      correction.execute(dylan, p.source.id, p.input, key()),
    ).rejects.toMatchObject({ code: 'SALE_DAY_ALREADY_CLOSED' });
    expect(
      await client.dailyClosing.findUniqueOrThrow({ where: { id: closed.id } }),
    ).toEqual(snapshot);
  });

  it('serializes closing creation with correction so no stale sales figure is frozen', async () => {
    const p = await pair();
    const outcomes = await Promise.allSettled([
      correction.execute(dylan, p.source.id, p.input, key()),
      closing().create(dylan, key(), {
        businessDate: p.businessDate,
        realCash: '0',
        realDigital: '25',
      }),
    ]);
    const doc = await client.saleCancellation.findUnique({
      where: { saleId: p.source.id },
    });
    const closed = await client.dailyClosing.findUniqueOrThrow({
      where: { businessDate: new Date(`${p.businessDate}T00:00:00Z`) },
    });
    expect(closed.systemSales.toString()).toBe(doc ? '25' : '50');
    expect(outcomes[1]?.status).toBe('fulfilled');
  });

  it('database rejects an incomplete correction and preserves immutable receipts', async () => {
    const p = await pair();
    const digest = 'a'.repeat(64);
    await expect(
      client.saleCancellation.create({
        data: {
          saleId: p.source.id,
          replacementSaleId: p.target.id,
          reassignedPaymentId: p.source.payment!.id,
          cancelledByUserId: dylan,
          cancelledAt: new Date(),
          reason: 'Synthetic',
          idempotencyKeyHash: digest,
          requestHash: digest,
        },
      }),
    ).rejects.toThrow();
    await expect(
      client.salePayment.delete({ where: { saleId: p.source.id } }),
    ).rejects.toThrow();
    await expect(
      client.sale.update({
        where: { id: p.source.id },
        data: { status: 'CANCELLED' },
      }),
    ).rejects.toThrow();
    expect(
      await client.saleCancellation.count({ where: { saleId: p.source.id } }),
    ).toBe(0);
  });

  it('exposes a private validated HTTP command, with CSRF and permission enforcement', async () => {
    const p = await pair();
    const endpoint = `/api/v1/sales/${p.source.id}/void-duplicate`;
    const call = () =>
      request(app.getHttpServer())
        .post(endpoint)
        .set('Host', 'localhost:3001')
        .set('Origin', 'http://localhost:3000')
        .set('Idempotency-Key', key());
    expect((await call().send(p.input)).status).toBe(401);
    const session = (await app.get(SessionService).create(jean)).revealOnce();
    const cookie = `sgi_session=${session}`;
    expect((await call().set('Cookie', cookie).send(p.input)).status).toBe(403);
    const csrf = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie);
    expect(csrf.status).toBe(200);
    expect(
      (
        await call()
          .set('Cookie', cookie)
          .set('X-CSRF-Token', String(csrf.body.data.csrfToken))
          .send(p.input)
      ).status,
    ).toBe(403);
    const adminCookie = `sgi_session=${(await app.get(SessionService).create(dylan)).revealOnce()}`;
    const adminCsrf = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Host', 'localhost:3001')
      .set('Cookie', adminCookie);
    const authorized = () =>
      call()
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', String(adminCsrf.body.data.csrfToken));
    expect(
      (await authorized().send({ ...p.input, stockReturned: false })).status,
    ).toBe(400);
    expect(
      (await authorized().send({ ...p.input, extraField: 'not allowed' }))
        .status,
    ).toBe(400);
    const response = await authorized().send(p.input);
    expect(response.status).toBe(201);
    expect(response.body.data.duplicateCorrection.replacementSale.id).toBe(
      p.target.id,
    );
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/sales/by-number/${p.target.saleNumber}`)
      .set('Host', 'localhost:3001')
      .set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.data.payment.id).toBe(p.source.payment!.id);
    expect(JSON.stringify(detail.body)).not.toMatch(
      /unitCost|requestHash|idempotencyKeyHash/u,
    );
  });
});
