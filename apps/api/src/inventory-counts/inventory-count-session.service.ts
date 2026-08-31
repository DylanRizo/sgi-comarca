import type {
  CaptureInventoryCountLineRequest,
  CreateInventoryCountSessionRequest,
  InventoryCountSessionSummary,
  InventoryCountSessionView,
  PaginatedData,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';
import { createHash } from 'node:crypto';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import {
  inventoryDecimalString,
  inventoryScaledInteger,
  maximumScaledInventoryQuantity,
} from '../inventory/inventory-quantity.js';
import { InventoryCountAuditService } from './inventory-count-audit.service.js';
import { InventoryCountError } from './inventory-count.errors.js';
import {
  loadSessionView,
  mapSessionSummary,
  sessionSelect,
  type SessionRecord,
} from './inventory-count.view.js';

type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;

const idempotencyKeyPattern = /^[\x21-\x7e]{16,128}$/u;
const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/u;

export type InventoryCountClock = { now(): Date };
const systemClock: InventoryCountClock = { now: () => new Date() };

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function nonNegativeQuantity(value: string): bigint {
  const parsed = inventoryScaledInteger(value);
  if (
    parsed === null ||
    parsed < 0n ||
    parsed > maximumScaledInventoryQuantity
  ) {
    throw new InventoryCountError('INVENTORY_COUNT_REQUEST_INVALID');
  }
  return parsed;
}

export function canonicalCreateSessionRequest(
  input: CreateInventoryCountSessionRequest,
): string {
  return JSON.stringify({
    businessDate: input.businessDate,
    reason: input.reason,
    warehouseIds: [...input.warehouseIds].sort(),
  });
}

function transactionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && ['P2002', 'P2034'].includes(String(error.code))) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return ['40001', '40P01', '55P03'].some((code) => message.includes(code));
}

/**
 * Count session creation, count capture and reads (plan §4, block 9B.1).
 *
 * Lines are insert-only by design: the schema has no BEFORE UPDATE guard on
 * them, so this service must never issue any UPDATE against a line other than
 * the one-time adjustment link written at approval. Correcting a miscount means
 * cancelling the session, not editing a captured line.
 */
export class InventoryCountSessionService {
  private readonly permissions: EffectivePermissionsService;

  constructor(
    private readonly client: DatabaseClient,
    private readonly audit: InventoryCountAuditService = new InventoryCountAuditService(),
    private readonly clock: InventoryCountClock = systemClock,
  ) {
    this.permissions = new EffectivePermissionsService(client);
  }

  async create(
    actorUserId: string,
    idempotencyKey: string | undefined,
    rawInput: CreateInventoryCountSessionRequest,
  ): Promise<InventoryCountSessionView> {
    if (idempotencyKey === undefined) {
      throw new InventoryCountError('IDEMPOTENCY_KEY_REQUIRED');
    }
    if (!idempotencyKeyPattern.test(idempotencyKey)) {
      throw new InventoryCountError('IDEMPOTENCY_KEY_INVALID');
    }
    const reason = rawInput.reason.trim();
    const warehouseIds = [...new Set(rawInput.warehouseIds)];
    if (
      !reason ||
      reason.length > 500 ||
      warehouseIds.length === 0 ||
      !businessDatePattern.test(rawInput.businessDate) ||
      Number.isNaN(Date.parse(`${rawInput.businessDate}T00:00:00Z`))
    ) {
      throw new InventoryCountError('INVENTORY_COUNT_REQUEST_INVALID');
    }
    const input = { ...rawInput, reason, warehouseIds };
    const idempotencyKeyHash = sha256(idempotencyKey);
    const requestHash = sha256(canonicalCreateSessionRequest(input));

    return this.run((transaction) =>
      this.createInTransaction(transaction, actorUserId, input, {
        idempotencyKeyHash,
        requestHash,
      }),
    );
  }

  async captureLine(
    actorUserId: string,
    sessionId: string,
    rawInput: CaptureInventoryCountLineRequest,
  ): Promise<InventoryCountSessionView> {
    const countedScaled = nonNegativeQuantity(rawInput.countedQuantity);
    const input = {
      ...rawInput,
      countedQuantity: inventoryDecimalString(countedScaled),
    };
    return this.run((transaction) =>
      this.captureInTransaction(transaction, actorUserId, sessionId, input),
    );
  }

  async get(
    actorUserId: string,
    sessionId: string,
  ): Promise<InventoryCountSessionView> {
    await this.authorizeRead(this.client, actorUserId);
    return loadSessionView(this.client, sessionId);
  }

  async list(
    actorUserId: string,
    query: { page: number; pageSize: number },
  ): Promise<PaginatedData<InventoryCountSessionSummary>> {
    await this.authorizeRead(this.client, actorUserId);
    const [totalItems, records] = await Promise.all([
      this.client.inventoryCountSession.count(),
      this.client.inventoryCountSession.findMany({
        orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
        select: { ...sessionSelect, _count: { select: { lines: true } } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const items = (
      records as (SessionRecord & { _count: { lines: number } })[]
    ).map((record) =>
      mapSessionSummary({ ...record, lineCount: record._count.lines }),
    );
    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / query.pageSize)),
      },
    };
  }

  private async run(
    operation: (
      transaction: TransactionClient,
    ) => Promise<InventoryCountSessionView>,
  ): Promise<InventoryCountSessionView> {
    try {
      return await this.client.$transaction(operation, {
        isolationLevel: 'ReadCommitted',
        timeout: 15_000,
      });
    } catch (error) {
      if (error instanceof InventoryCountError) throw error;
      if (transactionConflict(error)) {
        throw new InventoryCountError('INVENTORY_COUNT_CONFLICT');
      }
      throw error;
    }
  }

  /**
   * Reads accept either capability: 9A granted no `inventory.audit.read`, so
   * requiring only `create` would leave a pure approver unable to review the
   * session it is being asked to approve.
   */
  private async authorizeRead(
    client: Pick<DatabaseClient, '$queryRaw' | 'user'>,
    actorUserId: string,
  ): Promise<void> {
    const actor = await client.user.findUnique({
      select: { activatedAt: true, status: true },
      where: { id: actorUserId },
    });
    if (!actor || actor.status !== 'ACTIVE' || !actor.activatedAt) {
      throw new InventoryCountError('INVENTORY_COUNT_PERMISSION_DENIED');
    }
    const allowed =
      (await this.permissions.hasPermissionUsing(
        client,
        actorUserId,
        'inventory.audit.create',
      )) ||
      (await this.permissions.hasPermissionUsing(
        client,
        actorUserId,
        'inventory.audit.approve',
      ));
    if (!allowed) {
      throw new InventoryCountError('INVENTORY_COUNT_PERMISSION_DENIED');
    }
  }

  private async authorize(
    transaction: TransactionClient,
    actorUserId: string,
    permission: string,
  ): Promise<void> {
    const actor = await transaction.user.findUnique({
      select: { activatedAt: true, status: true },
      where: { id: actorUserId },
    });
    if (
      !actor ||
      actor.status !== 'ACTIVE' ||
      !actor.activatedAt ||
      !(await this.permissions.hasPermissionUsing(
        transaction,
        actorUserId,
        permission,
      ))
    ) {
      throw new InventoryCountError('INVENTORY_COUNT_PERMISSION_DENIED');
    }
  }

  private async createInTransaction(
    transaction: TransactionClient,
    actorUserId: string,
    input: CreateInventoryCountSessionRequest,
    hashes: { idempotencyKeyHash: string; requestHash: string },
  ): Promise<InventoryCountSessionView> {
    await this.authorize(transaction, actorUserId, 'inventory.audit.create');

    const scope = `inventory.count.create:${actorUserId}:${hashes.idempotencyKeyHash}`;
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))
    `;
    const claimed = await transaction.inventoryCountSession.findUnique({
      select: { id: true, requestHash: true },
      where: {
        createdByUserId_idempotencyKeyHash: {
          createdByUserId: actorUserId,
          idempotencyKeyHash: hashes.idempotencyKeyHash,
        },
      },
    });
    if (claimed) {
      if (claimed.requestHash !== hashes.requestHash) {
        throw new InventoryCountError('IDEMPOTENCY_KEY_REUSED');
      }
      return loadSessionView(transaction, claimed.id);
    }

    const warehouses = await transaction.warehouse.findMany({
      select: { id: true },
      where: { active: true, id: { in: input.warehouseIds } },
    });
    if (warehouses.length !== input.warehouseIds.length) {
      throw new InventoryCountError('INVENTORY_COUNT_WAREHOUSE_NOT_FOUND');
    }

    const occurredAt = this.clock.now();
    const session = await transaction.inventoryCountSession.create({
      data: {
        businessDate: new Date(`${input.businessDate}T00:00:00Z`),
        createdByUserId: actorUserId,
        idempotencyKeyHash: hashes.idempotencyKeyHash,
        reason: input.reason,
        requestHash: hashes.requestHash,
        status: 'OPEN',
        warehouses: {
          create: input.warehouseIds.map((warehouseId) => ({ warehouseId })),
        },
      },
      select: { id: true },
    });
    await this.audit.recordSessionCreated(transaction, {
      actorUserId,
      businessDate: input.businessDate,
      occurredAt,
      reason: input.reason,
      sessionId: session.id,
      warehouseIds: input.warehouseIds,
    });

    return loadSessionView(transaction, session.id);
  }

  private async captureInTransaction(
    transaction: TransactionClient,
    actorUserId: string,
    sessionId: string,
    input: CaptureInventoryCountLineRequest,
  ): Promise<InventoryCountSessionView> {
    await this.authorize(transaction, actorUserId, 'inventory.audit.create');

    // The natural key is the idempotency scope here: a captured line is
    // immutable, so a double submit must replay instead of racing the insert.
    const scope = `inventory.count.line:${sessionId}:${input.productId}:${input.warehouseId}`;
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))
    `;

    const current = await this.lockSession(transaction, sessionId);
    const existing = await transaction.inventoryCountLine.findUnique({
      select: { countedQuantity: true },
      where: {
        sessionId_productId_warehouseId: {
          productId: input.productId,
          sessionId,
          warehouseId: input.warehouseId,
        },
      },
    });
    if (existing) {
      if (existing.countedQuantity.toString() !== input.countedQuantity) {
        throw new InventoryCountError('INVENTORY_COUNT_LINE_ALREADY_CAPTURED');
      }
      return loadSessionView(transaction, sessionId);
    }
    if (current.status !== 'OPEN') {
      throw new InventoryCountError('INVENTORY_COUNT_INVALID_STATE');
    }

    const inScope = await transaction.inventoryCountSessionWarehouse.findUnique(
      {
        select: { id: true },
        where: {
          sessionId_warehouseId: { sessionId, warehouseId: input.warehouseId },
        },
      },
    );
    if (!inScope) {
      throw new InventoryCountError('INVENTORY_COUNT_WAREHOUSE_OUT_OF_SCOPE');
    }
    const product = await transaction.product.findFirst({
      select: { id: true },
      where: { active: true, id: input.productId },
    });
    if (!product) {
      throw new InventoryCountError('INVENTORY_COUNT_PRODUCT_NOT_FOUND');
    }

    // The expected quantity is the balance as it stands when the count is
    // captured. Approval re-checks it: a later movement invalidates the count.
    const balance = await transaction.inventoryBalance.findUnique({
      select: { quantity: true },
      where: {
        productId_warehouseId: {
          productId: input.productId,
          warehouseId: input.warehouseId,
        },
      },
    });
    const expectedScaled = nonNegativeQuantity(
      balance?.quantity.toString() ?? '0',
    );
    const countedScaled = nonNegativeQuantity(input.countedQuantity);
    const expectedQuantity = inventoryDecimalString(expectedScaled);
    const countedQuantity = inventoryDecimalString(countedScaled);
    const difference = inventoryDecimalString(countedScaled - expectedScaled);

    const occurredAt = this.clock.now();
    const line = await transaction.inventoryCountLine.create({
      data: {
        countedAt: occurredAt,
        countedQuantity,
        difference,
        expectedQuantity,
        productId: input.productId,
        sessionId,
        warehouseId: input.warehouseId,
      },
      select: { id: true },
    });
    await this.audit.recordLineCaptured(transaction, {
      actorUserId,
      countedQuantity,
      difference,
      expectedQuantity,
      lineId: line.id,
      occurredAt,
      productId: input.productId,
      sessionId,
      warehouseId: input.warehouseId,
    });

    return loadSessionView(transaction, sessionId);
  }

  /** Serialize concurrent work on the same session. */
  private async lockSession(
    transaction: TransactionClient,
    sessionId: string,
  ): Promise<{ status: string }> {
    const rows = await transaction.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status
      FROM inventory_count_sessions
      WHERE id = ${sessionId}::uuid
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) {
      throw new InventoryCountError('INVENTORY_COUNT_SESSION_NOT_FOUND');
    }
    return row;
  }
}
