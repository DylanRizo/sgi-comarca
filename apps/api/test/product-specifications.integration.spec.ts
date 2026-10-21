import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';
import { prepareOperationalCatalogs } from '../../../packages/database/src/bootstrap/operational-catalogs.js';
import { createApplication } from '../src/bootstrap.js';
import { SessionService } from '../src/auth/application/session.service.js';
import { CsrfTokenService } from '../src/auth/http/csrf-token.service.js';
import { StockReceiptService } from '../src/stock-receipts/stock-receipt.service.js';
import { ProductWriteService } from '../src/products/product-write.service.js';
import { ProductReadService } from '../src/products/product-read.service.js';

const originalUrl = process.env.DATABASE_URL!;
const databaseName = `sgi_specs_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const specs = {
  materialsDescription: '85% poliéster\n15% elastano',
  measurementChart: 'Pecho: 95–102 cm\nLargo: 68 cm',
  photosUrl:
    'https://drive.google.com/drive/folders/synthetic-test?usp=sharing',
};
type Browser = { cookie: string; csrf: string };
describe.sequential(
  'ADR-023 product specifications, real PostgreSQL and HTTP',
  () => {
    let administrator: DatabaseClient,
      client: DatabaseClient,
      app: Awaited<ReturnType<typeof createApplication>>;
    let receipts: StockReceiptService,
      writes: ProductWriteService,
      reads: ProductReadService;
    let dylan: string,
      luden: string,
      jean: string,
      samantha: string,
      unitId: string,
      groupId: string,
      warehouseId: string;
    beforeAll(async () => {
      const url = new URL(originalUrl);
      url.pathname = '/postgres';
      administrator = createDatabaseClient(url.toString());
      await administrator.$executeRawUnsafe(
        `CREATE DATABASE "${databaseName}"`,
      );
      url.pathname = '/' + databaseName;
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
      await prepareOperationalCatalogs(client);
      await client.user.updateMany({
        data: { status: 'ACTIVE', activatedAt: new Date() },
      });
      const users = await client.user.findMany();
      const id = (name: string) =>
        users.find((u) => u.loginIdentifier === name)!.id;
      dylan = id('dylan');
      luden = id('luden');
      jean = id('jean');
      samantha = id('samantha');
      unitId = (
        await client.unit.findUniqueOrThrow({ where: { code: 'UNIDADES' } })
      ).id;
      groupId = (
        await client.productGroup.findUniqueOrThrow({
          where: { code: 'GENERAL' },
        })
      ).id;
      warehouseId = (
        await client.warehouse.findUniqueOrThrow({
          where: { code: 'CASA_DYLAN' },
        })
      ).id;
      receipts = new StockReceiptService(client);
      writes = new ProductWriteService(client);
      reads = new ProductReadService(client);
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
    const product = () => ({
      code: 'SPECS-' + randomUUID().slice(0, 8).toUpperCase(),
      name: 'Producto sintético',
      unitId,
      groupId,
      minimumStock: '1',
    });
    async function browser(actor: string): Promise<Browser> {
      const token = (await app.get(SessionService).create(actor)).revealOnce();
      return {
        cookie: 'sgi_session=' + token,
        csrf: app.get(CsrfTokenService).create(token),
      };
    }
    const get = (auth: Browser, path: string) =>
      request(app.getHttpServer())
        .get('/api/v1' + path)
        .set('Host', 'localhost:3001')
        .set('Cookie', auth.cookie);
    const post = (auth: Browser, path: string, body: object) =>
      request(app.getHttpServer())
        .post('/api/v1' + path)
        .set('Host', 'localhost:3001')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', auth.csrf)
        .set('Idempotency-Key', randomUUID())
        .send(body);
    const patch = (auth: Browser, id: string, body: object) =>
      request(app.getHttpServer())
        .patch('/api/v1/products/' + id)
        .set('Host', 'localhost:3001')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', auth.csrf)
        .set('Idempotency-Key', randomUUID())
        .send(body);
    const overrides = (
      auth: Browser,
      id: string,
      values: { code: string; effect: 'GRANT' | 'DENY' }[],
    ) =>
      request(app.getHttpServer())
        .put('/api/v1/users/' + id + '/permissions')
        .set('Host', 'localhost:3001')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', auth.csrf)
        .send({ overrides: values });
    it('keeps nullable migration fields and the approved 28-permission catalog', async () => {
      const p = await receipts.createProduct(jean, randomUUID(), product());
      expect(p.product).toMatchObject({
        materialsDescription: null,
        measurementChart: null,
        photosUrl: null,
      });
      expect(await client.permission.count()).toBe(28);
    });
    it.each(['dylan', 'luden'])(
      'creates specifications plus first receipt exactly once for %s',
      async (name) => {
        const actor = name === 'dylan' ? dylan : luden,
          key = randomUUID();
        const body = {
          ...product(),
          ...specs,
          initialReceipt: {
            warehouseId,
            quantity: '2.5',
            reason: 'Recepción sintética',
          },
        };
        const first = await receipts.createProduct(actor, key, body),
          replay = await receipts.createProduct(actor, key, body);
        expect(replay.product.id).toBe(first.product.id);
        expect(replay.product).toMatchObject(specs);
        expect(
          await client.inventoryBalance.findUniqueOrThrow({
            where: {
              productId_warehouseId: {
                productId: first.product.id,
                warehouseId,
              },
            },
          }),
        ).toMatchObject({ quantity: expect.anything() });
        expect(
          (
            await client.inventoryBalance.findFirstOrThrow({
              where: { productId: first.product.id },
            })
          ).quantity.toString(),
        ).toBe('2.5');
        expect(
          await client.inventoryMovement.count({
            where: { productId: first.product.id },
          }),
        ).toBe(1);
        expect(
          await client.auditLog.count({
            where: { entityId: first.product.id, action: 'product.created' },
          }),
        ).toBe(1);
        const audit = await client.auditLog.findFirstOrThrow({
          where: { entityId: first.product.id, action: 'product.created' },
        });
        expect(audit.afterData).toMatchObject(specs);
        const detail = await get(
          await browser(jean),
          '/inventory/products/' + first.product.id,
        );
        expect(detail.status).toBe(200);
        expect(detail.body.data.product).toMatchObject(specs);
        expect(detail.body.data.balances[0].currentUnitCost).toBeNull();
      },
    );
    it.each(['jean', 'samantha'])(
      'rejects technical creation/clearing for %s while preserving normal editing',
      async (name) => {
        const actor = name === 'jean' ? jean : samantha,
          auth = await browser(actor),
          base = product();
        const denied = await post(auth, '/products', { ...base, ...specs });
        expect(denied.status).toBe(403);
        expect(denied.body.error.code).toBe('STOCK_PERMISSION_DENIED');
        expect(await client.product.count({ where: { code: base.code } })).toBe(
          0,
        );
        const created = await receipts.createProduct(dylan, randomUUID(), {
          ...base,
          ...specs,
        });
        const normal = await writes.edit(
          actor,
          created.product.id,
          randomUUID(),
          {
            ...base,
            name: 'Nombre corregido',
            expectedUpdatedAt: created.product.updatedAt,
          },
        );
        expect(normal).toMatchObject(specs);
        for (const fields of [
          { materialsDescription: null },
          { measurementChart: '' },
          { photosUrl: null },
          { materialsDescription: 'Reemplazado' },
        ]) {
          const response = await patch(auth, normal.id, {
            ...base,
            ...fields,
            expectedUpdatedAt: normal.updatedAt,
          });
          expect(response.status).toBe(403);
        }
        expect(await reads.get(normal.id)).toMatchObject(specs);
      },
    );
    it('edits and explicitly clears values with immutable audit and no inventory side effects', async () => {
      const base = product(),
        created = await receipts.createProduct(dylan, randomUUID(), {
          ...base,
          ...specs,
        });
      const beforeMovements = await client.inventoryMovement.count(),
        key = randomUUID();
      const body = {
        ...base,
        materialsDescription: 'Tela corregida',
        measurementChart: null,
        photosUrl: '',
        expectedUpdatedAt: created.product.updatedAt,
      };
      const result = await writes.edit(luden, created.product.id, key, body);
      const replay = await writes.edit(luden, created.product.id, key, body);
      expect(replay).toEqual(result);
      expect(result).toMatchObject({
        materialsDescription: 'Tela corregida',
        measurementChart: null,
        photosUrl: null,
      });
      const audits = await client.auditLog.findMany({
        where: { entityId: result.id, action: 'product.updated' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.beforeData).toMatchObject(specs);
      expect(audits[0]?.afterData).toMatchObject({
        measurementChart: null,
        photosUrl: null,
      });
      expect(await client.inventoryMovement.count()).toBe(beforeMovements);
    });
    it('rejects a stale competing edit rather than losing specification changes', async () => {
      const base = product(),
        p = await receipts.createProduct(dylan, randomUUID(), {
          ...base,
          ...specs,
        });
      await client.product.update({
        where: { id: p.product.id },
        data: { updatedAt: new Date('2020-01-01T00:00:00Z') },
      });
      const version = (await reads.get(p.product.id)).updatedAt;
      const outcomes = await Promise.allSettled([
        writes.edit(dylan, p.product.id, randomUUID(), {
          ...base,
          materialsDescription: 'A',
          expectedUpdatedAt: version,
        }),
        writes.edit(luden, p.product.id, randomUUID(), {
          ...base,
          materialsDescription: 'B',
          expectedUpdatedAt: version,
        }),
      ]);
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.find((o) => o.status === 'rejected')).toMatchObject({
        reason: { code: 'STOCK_OPERATION_CONFLICT' },
      });
    });
    it('validates URLs/limits over HTTP, accepts empty clearing and protects the new capability route', async () => {
      const anonymous = await request(app.getHttpServer())
        .get('/api/v1/products/specifications-access')
        .set('Host', 'localhost:3001');
      expect(anonymous.status).toBe(401);
      for (const [actor, canEdit] of [
        [dylan, true],
        [luden, true],
        [jean, false],
        [samantha, false],
      ] as const) {
        const response = await get(
          await browser(actor),
          '/products/specifications-access',
        );
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ canEditSpecifications: canEdit });
      }
      const auth = await browser(dylan);
      for (const fields of [
        {
          photosUrl: 'https://drive.google.com.evil.invalid/drive/folders/test',
        },
        { photosUrl: 'javascript:alert(1)' },
        { photosUrl: 'https://drive.google.com/file/d/test/view' },
        { materialsDescription: 'x'.repeat(4001) },
        { measurementChart: 'x'.repeat(8001) },
      ]) {
        expect(
          (await post(auth, '/products', { ...product(), ...fields })).status,
        ).toBe(400);
      }
      expect(
        (await post(auth, '/products', { ...product(), photosUrl: '' })).status,
      ).toBe(201);
    });
    it('lets only the administrator delegate and revoke specifications through the existing audited API', async () => {
      const admin = await browser(dylan),
        user = await browser(jean);
      const capability = '/products/specifications-access';
      const permission = 'products.specifications.manage';
      const base = product();
      const p = await receipts.createProduct(dylan, randomUUID(), {
        ...base,
        ...specs,
      });
      expect(
        (await overrides(user, jean, [{ code: permission, effect: 'GRANT' }]))
          .status,
      ).toBe(403);
      expect(
        (await get(user, capability)).body.data.canEditSpecifications,
      ).toBe(false);
      expect(
        (await overrides(admin, jean, [{ code: permission, effect: 'GRANT' }]))
          .status,
      ).toBe(200);
      expect(
        (await get(user, capability)).body.data.canEditSpecifications,
      ).toBe(true);
      const edited = await patch(user, p.product.id, {
        ...base,
        expectedUpdatedAt: p.product.updatedAt,
        materialsDescription: 'Edición delegada',
      });
      expect(edited.status).toBe(200);
      expect((await overrides(admin, jean, [])).status).toBe(200);
      expect(
        (await get(user, capability)).body.data.canEditSpecifications,
      ).toBe(false);
      expect(
        (
          await patch(user, p.product.id, {
            ...base,
            expectedUpdatedAt: edited.body.data.updatedAt,
            materialsDescription: 'Sin permiso',
          })
        ).status,
      ).toBe(403);
      expect(
        await client.userRole.count({
          where: { userId: jean, revokedAt: null, role: { code: 'ADMIN' } },
        }),
      ).toBe(0);
      expect(
        await client.auditLog.count({
          where: { entityId: jean, action: 'ADMIN_USER_PERMISSIONS_CHANGED' },
        }),
      ).toBe(2);
    });
    it('honors a technical-capability DENY for both initial editors, preserving their other overrides', async () => {
      const admin = await browser(dylan);
      for (const actor of [dylan, luden]) {
        const original = await client.userPermission.findMany({
          where: { userId: actor, revokedAt: null },
          include: { permission: true },
        });
        const previous = original.map((p) => ({
          code: p.permission.code,
          effect: p.effect,
        }));
        const denied = previous.filter(
          (p) => p.code !== 'products.specifications.manage',
        );
        denied.push({ code: 'products.specifications.manage', effect: 'DENY' });
        expect((await overrides(admin, actor, denied)).status).toBe(200);
        const auth = await browser(actor);
        expect(
          (await get(auth, '/products/specifications-access')).body.data
            .canEditSpecifications,
        ).toBe(false);
        expect(
          (await post(auth, '/products', { ...product(), ...specs })).status,
        ).toBe(403);
        expect((await overrides(admin, actor, previous)).status).toBe(200);
      }
    });
    it('keeps explicit products.manage DENY effective even for an administrator or Luden', async () => {
      const permission = await client.permission.findUniqueOrThrow({
        where: { code: 'products.manage' },
      });
      for (const actor of [dylan, luden]) {
        const deny = await client.userPermission.create({
          data: {
            userId: actor,
            permissionId: permission.id,
            effect: 'DENY',
            grantedByUserId: dylan,
          },
        });
        const auth = await browser(actor);
        expect(
          (await get(auth, '/products/specifications-access')).status,
        ).toBe(403);
        expect(
          (await post(auth, '/products', { ...product(), ...specs })).status,
        ).toBe(403);
        await client.userPermission.update({
          where: { id: deny.id },
          data: { revokedAt: new Date(), revokedByUserId: dylan },
        });
      }
    });
  },
);
