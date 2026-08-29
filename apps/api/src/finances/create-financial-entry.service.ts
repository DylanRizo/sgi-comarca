import type {
  CreateFinancialEntryRequest,
  FinanceLineView,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import { centsToMoney, moneyToCents } from '../common/money.js';
import { FinanceAuditService } from './finance-audit.service.js';
import {
  canonicalFinancialEntryRequest,
  idempotencyKeyPattern,
  sha256,
} from './finance-request.canonical.js';
import { FinanceError } from './finance.errors.js';

type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;

export type FinanceClock = { now(): Date };
const systemClock: FinanceClock = { now: () => new Date() };

function transactionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && ['P2002', 'P2034'].includes(String(error.code))) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return ['40001', '40P01', '55P03'].some((code) => message.includes(code));
}

export class CreateFinancialEntryService {
  private readonly permissions: EffectivePermissionsService;

  constructor(
    private readonly client: DatabaseClient,
    private readonly audit: FinanceAuditService = new FinanceAuditService(),
    private readonly clock: FinanceClock = systemClock,
  ) {
    this.permissions = new EffectivePermissionsService(client);
  }

  /**
   * Create one manual financial entry.
   *
   * Only manual entries are ever persisted: sales income is derived when
   * reading (ADR-010, DEC-022), so this path can never introduce a duplicate.
   * The entry is immutable once written, so correcting it means posting a
   * reversing entry rather than editing history.
   */
  async create(
    actorUserId: string,
    idempotencyKey: string | undefined,
    input: CreateFinancialEntryRequest,
  ): Promise<FinanceLineView> {
    if (idempotencyKey === undefined) {
      throw new FinanceError('FINANCE_REQUEST_INVALID');
    }
    if (!idempotencyKeyPattern.test(idempotencyKey)) {
      throw new FinanceError('FINANCE_REQUEST_INVALID');
    }
    // Canonicalization validates shape, scale and a strictly positive amount.
    const canonical = canonicalFinancialEntryRequest(input);
    const requestHash = sha256(canonical);
    const idempotencyKeyHash = sha256(idempotencyKey);

    try {
      return await this.client.$transaction(
        (transaction) =>
          this.createInTransaction(transaction, actorUserId, canonical, {
            idempotencyKeyHash,
            requestHash,
          }),
        { isolationLevel: 'ReadCommitted', timeout: 15_000 },
      );
    } catch (error) {
      if (error instanceof FinanceError) throw error;
      if (transactionConflict(error)) {
        throw new FinanceError('FINANCE_CONCURRENCY_CONFLICT');
      }
      throw error;
    }
  }

  private async createInTransaction(
    transaction: TransactionClient,
    actorUserId: string,
    canonical: string,
    hashes: { idempotencyKeyHash: string; requestHash: string },
  ): Promise<FinanceLineView> {
    const request = JSON.parse(canonical) as {
      amount: string;
      businessDate: string;
      categoryId: string;
      description: string | null;
      entryType: 'EXPENSE' | 'INCOME';
      responsibleUserId: string;
    };

    // Revalidate the actor and permission inside the transaction; a grant can
    // be revoked concurrently.
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
        'finances.manual.create',
      ))
    ) {
      throw new FinanceError('FINANCE_PERMISSION_DENIED');
    }

    const scope = `finances.entry:${actorUserId}:${hashes.idempotencyKeyHash}`;
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))
    `;
    const replay = await transaction.financialEntry.findUnique({
      select: { id: true, requestHash: true },
      where: {
        createdByUserId_idempotencyKeyHash: {
          createdByUserId: actorUserId,
          idempotencyKeyHash: hashes.idempotencyKeyHash,
        },
      },
    });
    if (replay) {
      if (replay.requestHash !== hashes.requestHash) {
        throw new FinanceError('FINANCE_CONCURRENCY_CONFLICT');
      }
      return this.loadLine(transaction, replay.id);
    }

    const category = await transaction.financialCategory.findUnique({
      select: { active: true, entryType: true, id: true },
      where: { id: request.categoryId },
    });
    if (
      !category ||
      !category.active ||
      category.entryType !== request.entryType
    ) {
      throw new FinanceError('FINANCE_CATEGORY_INVALID');
    }

    const responsible = await transaction.user.findUnique({
      select: { activatedAt: true, status: true },
      where: { id: request.responsibleUserId },
    });
    if (
      !responsible ||
      responsible.status !== 'ACTIVE' ||
      !responsible.activatedAt
    ) {
      throw new FinanceError('FINANCE_RESPONSIBLE_INVALID');
    }

    const occurredAt = this.clock.now();
    const entry = await transaction.financialEntry.create({
      data: {
        amount: request.amount,
        businessDate: new Date(`${request.businessDate}T00:00:00.000Z`),
        categoryId: category.id,
        createdByUserId: actorUserId,
        currencyCode: 'NIO',
        description: request.description,
        entryType: request.entryType,
        idempotencyKeyHash: hashes.idempotencyKeyHash,
        origin: 'OPERATIONAL',
        requestHash: hashes.requestHash,
        responsibleUserId: request.responsibleUserId,
      },
      select: { id: true },
    });

    await this.audit.recordEntryCreated(transaction, {
      actorUserId,
      amount: request.amount,
      businessDate: request.businessDate,
      categoryId: category.id,
      entryId: entry.id,
      entryType: request.entryType,
      occurredAt,
      responsibleUserId: request.responsibleUserId,
    });

    return this.loadLine(transaction, entry.id);
  }

  private async loadLine(
    transaction: TransactionClient,
    id: string,
  ): Promise<FinanceLineView> {
    const entry = await transaction.financialEntry.findUnique({
      select: {
        amount: true,
        businessDate: true,
        category: {
          select: {
            active: true,
            code: true,
            entryType: true,
            id: true,
            name: true,
          },
        },
        createdAt: true,
        currencyCode: true,
        description: true,
        entryType: true,
        id: true,
        responsibleUserId: true,
      },
      where: { id },
    });
    if (!entry) throw new FinanceError('FINANCE_CONCURRENCY_CONFLICT');
    const cents = moneyToCents(entry.amount.toString());
    if (cents === null) throw new FinanceError('FINANCE_CONCURRENCY_CONFLICT');
    return {
      amount: centsToMoney(cents),
      businessDate: entry.businessDate.toISOString().slice(0, 10),
      category: entry.category,
      createdAt: entry.createdAt.toISOString(),
      currencyCode: entry.currencyCode,
      description: entry.description,
      entryType: entry.entryType,
      id: entry.id,
      responsibleUserId: entry.responsibleUserId,
      saleId: null,
      saleNumber: null,
      source: 'MANUAL',
    };
  }
}
