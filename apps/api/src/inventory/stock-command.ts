import type { StockOperationErrorCode } from '@sgi/contracts';
import { Prisma, type DatabaseClient } from '@sgi/database';
import { createHash } from 'node:crypto';
import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';

export type StockTransaction = Prisma.TransactionClient;
export class StockOperationError extends Error {
  constructor(readonly code: StockOperationErrorCode) {
    super(code);
  }
}

export function decimalInput(
  value: string,
  money = false,
  positive = false,
): Prisma.Decimal {
  const pattern = money
    ? /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/u
    : /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/u;
  if (typeof value !== 'string' || !pattern.test(value))
    throw new StockOperationError('STOCK_REQUEST_INVALID');
  const decimal = new Prisma.Decimal(value);
  if (positive && !decimal.gt(0))
    throw new StockOperationError('STOCK_REQUEST_INVALID');
  return decimal;
}

export async function authorizeStock(
  client: StockTransaction,
  actorUserId: string,
  ...permissions: string[]
) {
  const actor = await client.user.findUnique({
    where: { id: actorUserId },
    select: { status: true, activatedAt: true },
  });
  if (!actor || actor.status !== 'ACTIVE' || !actor.activatedAt)
    throw new StockOperationError('STOCK_PERMISSION_DENIED');
  for (const permission of permissions) {
    if (
      !(await new EffectivePermissionsService(
        client as DatabaseClient,
      ).hasPermissionUsing(client, actorUserId, permission))
    )
      throw new StockOperationError('STOCK_PERMISSION_DENIED');
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

export async function stockCommand<T extends Prisma.InputJsonValue>(
  client: DatabaseClient,
  actorUserId: string,
  operation: string,
  key: string | undefined,
  payload: unknown,
  permissions: string[],
  work: (transaction: StockTransaction) => Promise<T>,
): Promise<T> {
  if (!key) throw new StockOperationError('IDEMPOTENCY_KEY_REQUIRED');
  if (!/^[\x21-\x7e]{16,128}$/u.test(key))
    throw new StockOperationError('IDEMPOTENCY_KEY_INVALID');
  const keyHash = hash(key),
    requestHash = hash(canonical(payload));
  try {
    return await client.$transaction(
      async (transaction) => {
        await authorizeStock(transaction, actorUserId, ...permissions);
        const scope = `${actorUserId}:${operation}:${keyHash}`;
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
        const existing = await transaction.inventoryCommand.findUnique({
          where: {
            actorUserId_operation_keyHash: { actorUserId, operation, keyHash },
          },
        });
        if (existing) {
          if (existing.requestHash !== requestHash)
            throw new StockOperationError('IDEMPOTENCY_KEY_REUSED');
          return existing.result as T;
        }
        const result = await work(transaction);
        await transaction.inventoryCommand.create({
          data: { actorUserId, operation, keyHash, requestHash, result },
        });
        return result;
      },
      { timeout: 30_000, isolationLevel: 'ReadCommitted' },
    );
  } catch (error) {
    if (error instanceof StockOperationError) throw error;
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ['P2002', 'P2034'].includes(String(error.code))
    )
      throw new StockOperationError('STOCK_OPERATION_CONFLICT');
    throw error;
  }
}
