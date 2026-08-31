import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InventoryAdjustmentService } from '../src/inventory/inventory-adjustment.service.js';
import { InventoryCountError } from '../src/inventory-counts/inventory-count.errors.js';
import { InventoryCountLifecycleService } from '../src/inventory-counts/inventory-count-lifecycle.service.js';
import { InventoryCountSessionService } from '../src/inventory-counts/inventory-count-session.service.js';
import { runBootstrap } from '../../../packages/database/src/bootstrap/run-bootstrap.js';

const sharedDatabaseUrl = process.env.DATABASE_URL;
if (!sharedDatabaseUrl) {
  throw new Error('Integration database setup did not provide DATABASE_URL.');
}

const execFileAsync = promisify(execFile);

function quoteDatabaseName(databaseName: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(databaseName)) {
    throw new Error('Unsafe temporary database name.');
  }
  return `"${databaseName}"`;
}

async function migrateDatabase(databaseUrl: string): Promise<void> {
  const databaseRoot = fileURLToPath(
    new URL('../../../packages/database/', import.meta.url),
  );
  const prismaCli = fileURLToPath(
    new URL(
      '../../../packages/database/node_modules/prisma/build/index.js',
      import.meta.url,
    ),
  );
  const prismaConfig = fileURLToPath(
    new URL('../../../packages/database/prisma.config.ts', import.meta.url),
  );
  await execFileAsync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--config', prismaConfig],
    {
      cwd: databaseRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      maxBuffer: 1024 * 1024,
    },
  );
}

function key(): string {
  return randomUUID() + randomUUID();
}

async function failureCode(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof InventoryCountError) return error.code;
    throw error;
  }
  throw new Error('Expected the operation to fail.');
}

describe('FASE 9B.1 inventory count lifecycle', () => {
  let administrator!: DatabaseClient;
  let client!: DatabaseClient;
  let sessions!: InventoryCountSessionService;
  let lifecycle!: InventoryCountLifecycleService;
  let adjustments!: InventoryAdjustmentService;
  let databaseName: string;
  let counterId: string;
  let secondCounterId: string;
  let approverId: string;
  let approverWithoutAdjustId: string;
  let outsiderId: string;
  let warehouseId: string;
  let otherWarehouseId: string;
  let productId: string;
  let secondProductId: string;
  let uncountedProductId: string;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  async function grant(userId: string, code: string): Promise<void> {
    const permission = await client.permission.findUniqueOrThrow({
      select: { id: true },
      where: { code },
    });
    await client.userPermission.create({
      data: {
        effect: 'GRANT',
        grantedByUserId: counterId,
        permissionId: permission.id,
        userId,
      },
    });
  }

  async function newUser(loginIdentifier: string): Promise<string> {
    const user = await client.user.create({
      data: {
        activatedAt: new Date(),
        displayName: `Synthetic ${loginIdentifier}`,
        loginIdentifier,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    return user.id;
  }

  async function setBalance(
    product: string,
    warehouse: string,
    quantity: string,
  ): Promise<void> {
    await client.inventoryBalance.upsert({
      create: {
        currentUnitCost: '4.00',
        currentUnitPrice: '10.00',
        productId: product,
        quantity,
        warehouseId: warehouse,
      },
      update: { quantity },
      where: {
        productId_warehouseId: { productId: product, warehouseId: warehouse },
      },
    });
  }

  async function balanceQuantity(
    product = productId,
    warehouse = warehouseId,
  ): Promise<number> {
    const balance = await client.inventoryBalance.findUniqueOrThrow({
      select: { quantity: true },
      where: {
        productId_warehouseId: { productId: product, warehouseId: warehouse },
      },
    });
    return Number(balance.quantity.toString());
  }

  async function newSession(warehouses = [warehouseId]): Promise<string> {
    const session = await sessions.create(counterId, key(), {
      businessDate: '2026-09-01',
      reason: 'conteo fisico mensual',
      warehouseIds: warehouses,
    });
    return session.id;
  }

  async function auditCount(action: string, entityId: string): Promise<number> {
    return client.auditLog.count({ where: { action, entityId } });
  }

  beforeAll(async () => {
    const source = new URL(sharedDatabaseUrl);
    databaseName =
      'sgi_phase9b1_' +
      process.pid.toString() +
      '_' +
      randomUUID().replaceAll('-', '').slice(0, 12);
    const administratorUrl = new URL(source);
    administratorUrl.pathname = '/postgres';
    administratorUrl.searchParams.delete('schema');
    const isolatedUrl = new URL(source);
    isolatedUrl.pathname = `/${databaseName}`;
    isolatedUrl.searchParams.set('schema', 'public');

    administrator = createDatabaseClient(administratorUrl.toString());
    await administrator.$executeRawUnsafe(
      `CREATE DATABASE ${quoteDatabaseName(databaseName)}`,
    );
    await migrateDatabase(isolatedUrl.toString());
    process.env.DATABASE_URL = isolatedUrl.toString();
    client = createDatabaseClient(isolatedUrl.toString());
    await runBootstrap(client);
    adjustments = new InventoryAdjustmentService(client);
    sessions = new InventoryCountSessionService(client);
    lifecycle = new InventoryCountLifecycleService(client, adjustments);

    const inventoryRole = await client.role.findUniqueOrThrow({
      select: { id: true },
      where: { code: 'INVENTORY_MANAGER' },
    });

    counterId = await newUser('phase9b1-counter');
    await grant(counterId, 'inventory.audit.create');
    await client.userRole.create({
      data: { roleId: inventoryRole.id, userId: counterId },
    });

    secondCounterId = await newUser('phase9b1-counter-2');
    await grant(secondCounterId, 'inventory.audit.create');
    await client.userRole.create({
      data: { roleId: inventoryRole.id, userId: secondCounterId },
    });

    // The approver also holds inventory.adjust, because approving delegates to
    // the FASE 5C adjustment path, which re-checks it against this actor.
    approverId = await newUser('phase9b1-approver');
    await grant(approverId, 'inventory.audit.approve');
    await client.userRole.create({
      data: { roleId: inventoryRole.id, userId: approverId },
    });

    approverWithoutAdjustId = await newUser('phase9b1-approver-only');
    await grant(approverWithoutAdjustId, 'inventory.audit.approve');

    outsiderId = await newUser('phase9b1-outsider');

    const [warehouse, otherWarehouse, product, second, uncounted] =
      await Promise.all([
        client.warehouse.create({
          data: { active: true, code: 'P9B1-W', name: 'Phase 9B1 warehouse' },
          select: { id: true },
        }),
        client.warehouse.create({
          data: { active: true, code: 'P9B1-W2', name: 'Phase 9B1 other' },
          select: { id: true },
        }),
        client.product.create({
          data: { active: true, code: 'P9B1-A', name: 'Phase 9B1 product' },
          select: { id: true },
        }),
        client.product.create({
          data: { active: true, code: 'P9B1-B', name: 'Phase 9B1 second' },
          select: { id: true },
        }),
        client.product.create({
          data: { active: true, code: 'P9B1-C', name: 'Phase 9B1 uncounted' },
          select: { id: true },
        }),
      ]);
    warehouseId = warehouse.id;
    otherWarehouseId = otherWarehouse.id;
    productId = product.id;
    secondProductId = second.id;
    uncountedProductId = uncounted.id;

    await setBalance(productId, warehouseId, '100');
    await setBalance(secondProductId, warehouseId, '50');
    await setBalance(uncountedProductId, warehouseId, '7');
  }, 180_000);

  afterAll(async () => {
    await client?.$disconnect();
    if (administrator) {
      await administrator.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS ${quoteDatabaseName(databaseName)} WITH (FORCE)`,
      );
      await administrator.$disconnect();
    }
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it('creates a session open, scoped, and replays the same key', async () => {
    const idempotencyKey = key();
    const request = {
      businessDate: '2026-09-01',
      reason: 'conteo inicial',
      warehouseIds: [warehouseId],
    };
    const first = await sessions.create(counterId, idempotencyKey, request);
    const replay = await sessions.create(counterId, idempotencyKey, request);

    expect(first.status).toBe('OPEN');
    expect(first.warehouses.map((w) => w.id)).toEqual([warehouseId]);
    expect(first.lines).toHaveLength(0);
    expect(replay.id).toBe(first.id);
    expect(await client.inventoryCountSession.count()).toBe(1);
    expect(await auditCount('inventory.count_session.created', first.id)).toBe(
      1,
    );
  });

  it('rejects a reused key with a different payload, per actor', async () => {
    const idempotencyKey = key();
    const request = {
      businessDate: '2026-09-02',
      reason: 'conteo A',
      warehouseIds: [warehouseId],
    };
    await sessions.create(counterId, idempotencyKey, request);

    expect(
      await failureCode(() =>
        sessions.create(counterId, idempotencyKey, {
          ...request,
          reason: 'conteo B',
        }),
      ),
    ).toBe('IDEMPOTENCY_KEY_REUSED');

    // The scope is the actor: another actor may reuse the literal key.
    const other = await sessions.create(secondCounterId, idempotencyKey, {
      ...request,
      reason: 'conteo de otro operador',
    });
    expect(other.status).toBe('OPEN');
  });

  it('demands a well formed idempotency key and a real warehouse', async () => {
    const request = {
      businessDate: '2026-09-03',
      reason: 'conteo',
      warehouseIds: [warehouseId],
    };
    expect(
      await failureCode(() => sessions.create(counterId, undefined, request)),
    ).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(
      await failureCode(() => sessions.create(counterId, 'short', request)),
    ).toBe('IDEMPOTENCY_KEY_INVALID');
    expect(
      await failureCode(() =>
        sessions.create(counterId, key(), {
          ...request,
          warehouseIds: [randomUUID()],
        }),
      ),
    ).toBe('INVENTORY_COUNT_WAREHOUSE_NOT_FOUND');
    expect(
      await failureCode(() =>
        sessions.create(counterId, key(), { ...request, reason: '   ' }),
      ),
    ).toBe('INVENTORY_COUNT_REQUEST_INVALID');
  });

  it('captures a line deriving expected and difference from the balance', async () => {
    const sessionId = await newSession();
    const view = await sessions.captureLine(counterId, sessionId, {
      countedQuantity: '94',
      productId,
      warehouseId,
    });

    const line = view.lines[0];
    expect(view.lines).toHaveLength(1);
    expect(line?.expectedQuantity).toBe('100');
    expect(line?.countedQuantity).toBe('94');
    expect(line?.difference).toBe('-6');
    expect(line?.adjustmentMovementId).toBeNull();
    // Capturing never touches stock; only approval does.
    expect(await balanceQuantity()).toBe(100);
  });

  it('replays an identical capture and refuses a different quantity', async () => {
    const sessionId = await newSession();
    await sessions.captureLine(counterId, sessionId, {
      countedQuantity: '94',
      productId,
      warehouseId,
    });
    const replay = await sessions.captureLine(counterId, sessionId, {
      countedQuantity: '94',
      productId,
      warehouseId,
    });
    expect(replay.lines).toHaveLength(1);

    expect(
      await failureCode(() =>
        sessions.captureLine(counterId, sessionId, {
          countedQuantity: '90',
          productId,
          warehouseId,
        }),
      ),
    ).toBe('INVENTORY_COUNT_LINE_ALREADY_CAPTURED');

    // A captured line is immutable: the refused correction changed nothing.
    const line = await client.inventoryCountLine.findFirstOrThrow({
      select: { countedQuantity: true },
      where: { sessionId },
    });
    expect(line.countedQuantity.toString()).toBe('94');
  });

  it('refuses a warehouse outside the declared scope', async () => {
    const sessionId = await newSession();
    expect(
      await failureCode(() =>
        sessions.captureLine(counterId, sessionId, {
          countedQuantity: '1',
          productId,
          warehouseId: otherWarehouseId,
        }),
      ),
    ).toBe('INVENTORY_COUNT_WAREHOUSE_OUT_OF_SCOPE');
  });

  it('refuses submitting an empty session and repeats submission safely', async () => {
    const empty = await newSession();
    expect(await failureCode(() => lifecycle.submit(counterId, empty))).toBe(
      'INVENTORY_COUNT_REQUIRES_LINES',
    );

    const sessionId = await newSession();
    await sessions.captureLine(counterId, sessionId, {
      countedQuantity: '100',
      productId,
      warehouseId,
    });
    const submitted = await lifecycle.submit(counterId, sessionId);
    const again = await lifecycle.submit(counterId, sessionId);
    expect(submitted.status).toBe('PENDING_APPROVAL');
    expect(again.status).toBe('PENDING_APPROVAL');
    expect(
      await auditCount('inventory.count_session.submitted', sessionId),
    ).toBe(1);

    // Lines are captured only while the session is open.
    expect(
      await failureCode(() =>
        sessions.captureLine(counterId, sessionId, {
          countedQuantity: '1',
          productId: secondProductId,
          warehouseId,
        }),
      ),
    ).toBe('INVENTORY_COUNT_INVALID_STATE');
  });

  it('refuses approving a session that was never submitted', async () => {
    const sessionId = await newSession();
    await sessions.captureLine(counterId, sessionId, {
      countedQuantity: '99',
      productId,
      warehouseId,
    });
    expect(
      await failureCode(() => lifecycle.approve(approverId, sessionId)),
    ).toBe('INVENTORY_COUNT_INVALID_STATE');
  });

  it('approves, adjusting only the lines that differ', async () => {
    await setBalance(productId, warehouseId, '100');
    await setBalance(secondProductId, warehouseId, '50');
    const sessionId = await newSession();
    await sessions.captureLine(counterId, sessionId, {
      countedQuantity: '96',
      productId,
      warehouseId,
    });
    // A line that matches the balance exactly must never produce an adjustment.
    await sessions.captureLine(counterId, sessionId, {
      countedQuantity: '50',
      productId: secondProductId,
      warehouseId,
    });
    await lifecycle.submit(counterId, sessionId);

    const movementsBefore = await client.inventoryMovement.count();
    const approved = await lifecycle.approve(approverId, sessionId);

    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedBy?.id).toBe(approverId);
    expect(await client.inventoryMovement.count()).toBe(movementsBefore + 1);
    expect(await balanceQuantity()).toBe(96);
    expect(await balanceQuantity(secondProductId)).toBe(50);

    const adjusted = approved.lines.find((l) => l.product.id === productId);
    const unchanged = approved.lines.find(
      (l) => l.product.id === secondProductId,
    );
    expect(adjusted?.adjustmentMovementId).not.toBeNull();
    expect(unchanged?.adjustmentMovementId).toBeNull();

    const movement = await client.inventoryMovement.findUniqueOrThrow({
      select: { quantityDelta: true, type: true },
      where: { id: adjusted?.adjustmentMovementId ?? '' },
    });
    expect(movement.type).toBe('ADJUSTMENT');
    expect(movement.quantityDelta.toString()).toBe('-4');

    // AT-AUD-02: a product in scope that was never counted is reported as
    // pending, never assumed zero and never adjusted.
    expect(approved.pendingItems.map((item) => item.product.id)).toContain(
      uncountedProductId,
    );
    expect(await balanceQuantity(uncountedProductId)).toBe(7);

    expect(
      await auditCount('inventory.count_session.approved', sessionId),
    ).toBe(1);
  });

  it('repeats approval without adjusting twice', async () => {
    await setBalance(productId, warehouseId, '100');
    const sessionId = await newSession();
    await sessions.captureLine(counterId, sessionId, {
      countedQuantity: '98',
      productId,
      warehouseId,
    });
    await lifecycle.submit(counterId, sessionId);
    await lifecycle.approve(approverId, sessionId);

    const movements = await client.inventoryMovement.count();
    const again = await lifecycle.approve(approverId, sessionId);

    expect(again.status).toBe('APPROVED');
    expect(await client.inventoryMovement.count()).toBe(movements);
    expect(await balanceQuantity()).toBe(98);
    expect(
      await auditCount('inventory.count_session.approved', sessionId),
    ).toBe(1);
  });

  it('refuses the whole approval when stock moved after the count', async () => {
    await setBalance(productId, warehouseId, '100');
    const sessionId = await newSession();
    await sessions.captureLine(counterId, sessionId, {
      countedQuantity: '90',
      productId,
      warehouseId,
    });
    await sessions.captureLine(counterId, sessionId, {
      countedQuantity: '45',
      productId: secondProductId,
      warehouseId,
    });
    await lifecycle.submit(counterId, sessionId);

    // Something legitimately moved the stock between counting and approval.
    await adjustments.adjust(counterId, {
      productId,
      quantityDelta: '5',
      reason: 'recepcion posterior al conteo',
      warehouseId,
    });
    const movements = await client.inventoryMovement.count();
    const secondBefore = await balanceQuantity(secondProductId);

    expect(
      await failureCode(() => lifecycle.approve(approverId, sessionId)),
    ).toBe('INVENTORY_COUNT_BALANCE_CHANGED');

    // Nothing partial survives: the untouched line was not adjusted either.
    expect(await client.inventoryMovement.count()).toBe(movements);
    expect(await balanceQuantity(secondProductId)).toBe(secondBefore);
    expect(await balanceQuantity()).toBe(105);
    const session = await client.inventoryCountSession.findUniqueOrThrow({
      select: { status: true },
      where: { id: sessionId },
    });
    expect(session.status).toBe('PENDING_APPROVAL');
    expect(
      await client.inventoryCountLine.count({
        where: { adjustmentMovementId: { not: null }, sessionId },
      }),
    ).toBe(0);
  });

  it('refuses an approver that cannot adjust inventory', async () => {
    await setBalance(productId, warehouseId, '100');
    const sessionId = await newSession();
    await sessions.captureLine(counterId, sessionId, {
      countedQuantity: '97',
      productId,
      warehouseId,
    });
    await lifecycle.submit(counterId, sessionId);

    expect(
      await failureCode(() =>
        lifecycle.approve(approverWithoutAdjustId, sessionId),
      ),
    ).toBe('INVENTORY_COUNT_APPROVER_CANNOT_ADJUST');
    expect(await balanceQuantity()).toBe(100);
  });

  it('cancels a session, repeats safely, and refuses cancelling an approved one', async () => {
    const sessionId = await newSession();
    await sessions.captureLine(counterId, sessionId, {
      countedQuantity: '100',
      productId,
      warehouseId,
    });
    const cancelled = await lifecycle.cancel(
      counterId,
      sessionId,
      'conteo mal ejecutado',
    );
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancellationReason).toBe('conteo mal ejecutado');

    const again = await lifecycle.cancel(counterId, sessionId, 'otra razon');
    expect(again.status).toBe('CANCELLED');
    expect(again.cancellationReason).toBe('conteo mal ejecutado');
    expect(
      await auditCount('inventory.count_session.cancelled', sessionId),
    ).toBe(1);

    await setBalance(productId, warehouseId, '100');
    const approvedSession = await newSession();
    await sessions.captureLine(counterId, approvedSession, {
      countedQuantity: '100',
      productId,
      warehouseId,
    });
    await lifecycle.submit(counterId, approvedSession);
    await lifecycle.approve(approverId, approvedSession);
    expect(
      await failureCode(() =>
        lifecycle.cancel(counterId, approvedSession, 'tardio'),
      ),
    ).toBe('INVENTORY_COUNT_INVALID_STATE');
  });

  it('lets an approver reject a submitted session by cancelling it', async () => {
    const sessionId = await newSession();
    await sessions.captureLine(counterId, sessionId, {
      countedQuantity: '100',
      productId,
      warehouseId,
    });
    await lifecycle.submit(counterId, sessionId);

    const rejected = await lifecycle.cancel(
      approverId,
      sessionId,
      'diferencias no justificadas',
    );
    expect(rejected.status).toBe('CANCELLED');
    expect(rejected.cancelledBy?.id).toBe(approverId);
  });

  it('denies every capability to an actor holding none', async () => {
    const sessionId = await newSession();
    expect(
      await failureCode(() =>
        sessions.create(outsiderId, key(), {
          businessDate: '2026-09-01',
          reason: 'intruso',
          warehouseIds: [warehouseId],
        }),
      ),
    ).toBe('INVENTORY_COUNT_PERMISSION_DENIED');
    expect(await failureCode(() => sessions.get(outsiderId, sessionId))).toBe(
      'INVENTORY_COUNT_PERMISSION_DENIED',
    );
    expect(
      await failureCode(() => lifecycle.submit(outsiderId, sessionId)),
    ).toBe('INVENTORY_COUNT_PERMISSION_DENIED');
    expect(
      await failureCode(() => lifecycle.approve(outsiderId, sessionId)),
    ).toBe('INVENTORY_COUNT_PERMISSION_DENIED');
    expect(
      await failureCode(() => lifecycle.cancel(outsiderId, sessionId, 'no')),
    ).toBe('INVENTORY_COUNT_PERMISSION_DENIED');
  });

  it('lets either capability read, since 9A defined no read permission', async () => {
    const sessionId = await newSession();
    const asCounter = await sessions.get(counterId, sessionId);
    const asApprover = await sessions.get(approverWithoutAdjustId, sessionId);
    expect(asCounter.id).toBe(sessionId);
    expect(asApprover.id).toBe(sessionId);

    const listed = await sessions.list(approverWithoutAdjustId, {
      page: 1,
      pageSize: 5,
    });
    expect(listed.items.length).toBeGreaterThan(0);
    expect(listed.pagination.page).toBe(1);
  });

  it('keeps exactly one effect when two approvals race', async () => {
    await setBalance(productId, warehouseId, '100');
    const sessionId = await newSession();
    await sessions.captureLine(counterId, sessionId, {
      countedQuantity: '93',
      productId,
      warehouseId,
    });
    await lifecycle.submit(counterId, sessionId);

    const movementsBefore = await client.inventoryMovement.count();
    const results = await Promise.allSettled([
      lifecycle.approve(approverId, sessionId),
      lifecycle.approve(approverId, sessionId),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(await client.inventoryMovement.count()).toBe(movementsBefore + 1);
    expect(await balanceQuantity()).toBe(93);
    expect(
      await client.inventoryCountLine.count({
        where: { adjustmentMovementId: { not: null }, sessionId },
      }),
    ).toBe(1);
  });

  it('reports a session that does not exist', async () => {
    expect(await failureCode(() => sessions.get(counterId, randomUUID()))).toBe(
      'INVENTORY_COUNT_SESSION_NOT_FOUND',
    );
    expect(
      await failureCode(() => lifecycle.submit(counterId, randomUUID())),
    ).toBe('INVENTORY_COUNT_SESSION_NOT_FOUND');
  });
});
