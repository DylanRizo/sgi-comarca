import type {
  CreateDailyClosingRequest,
  DailyClosingView,
} from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import { calculateClosing } from './daily-closing.calculation.js';
import { FinanceAuditService } from './finance-audit.service.js';
import { closingSelect, mapClosing } from './finance-read.service.js';
import {
  canonicalDailyClosingRequest,
  canonicalReopeningRequest,
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

export interface DailyClosingSettings {
  /** Tolerance below which a closing counts as balanced (DEC-024). */
  tolerance: string;
  /** Days after the business date during which reopening stays open (DEC-025). */
  reopeningWindowDays: number;
}

function transactionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && ['P2002', 'P2034'].includes(String(error.code))) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return ['40001', '40P01', '55P03'].some((code) => message.includes(code));
}

/** A client that can run the day-figures query, inside a transaction or not. */
type SalesFigureClient = { $queryRawUnsafe: DatabaseClient['$queryRawUnsafe'] };

export interface DaySalesFigures {
  systemSales: string;
  inTransitSaleCount: number;
}

/**
 * The day's sales as the closing counts them: only completed sales, with
 * transit and cancelled excluded by the approved rule.
 *
 * Shared by the preview and the closing itself on purpose. If the preview ran
 * its own query the two could drift, and a partner would count the drawer
 * against one number while the system recorded another.
 */
export async function daySalesFigures(
  client: SalesFigureClient,
  businessDate: string,
): Promise<DaySalesFigures> {
  const [row] = await client.$queryRawUnsafe<
    { in_transit: bigint; total: string }[]
  >(
    `SELECT
       coalesce(sum(total) FILTER (WHERE status = 'COMPLETED'), 0)::text AS total,
       count(*) FILTER (WHERE status = 'IN_TRANSIT')::bigint AS in_transit
     FROM sales WHERE business_date = $1::date`,
    businessDate,
  );
  return {
    inTransitSaleCount: Number(row?.in_transit ?? 0n),
    systemSales: row?.total ?? '0',
  };
}

function civilDateUtc(businessDate: string): Date {
  return new Date(`${businessDate}T00:00:00.000Z`);
}

export class DailyClosingService {
  private readonly permissions: EffectivePermissionsService;

  constructor(
    private readonly client: DatabaseClient,
    private readonly settings: DailyClosingSettings,
    private readonly audit: FinanceAuditService = new FinanceAuditService(),
    private readonly clock: FinanceClock = systemClock,
  ) {
    this.permissions = new EffectivePermissionsService(client);
  }

  /**
   * Load a closing through the transaction client. Reading it with the base
   * client would not see rows written by the still-uncommitted transaction.
   */
  private async loadClosing(
    transaction: TransactionClient,
    id: string,
  ): Promise<DailyClosingView> {
    const row = await transaction.dailyClosing.findUnique({
      select: closingSelect,
      where: { id },
    });
    if (!row) throw new FinanceError('CLOSING_NOT_FOUND');
    return mapClosing(row);
  }

  /**
   * Create the daily closing for a business date.
   *
   * The counted cash and digital amounts are the operator's intent; the system
   * sales figure, the tolerance and the balanced flag are resolved by the
   * server (ADR-010). Expenses take no part in the difference (DEC-023).
   *
   * In-transit sales for that date are counted and reported, never touched
   * (DEC-019): a closing creates no inventory movement and cancels nothing.
   */
  async create(
    actorUserId: string,
    idempotencyKey: string | undefined,
    input: CreateDailyClosingRequest,
  ): Promise<DailyClosingView> {
    if (
      idempotencyKey === undefined ||
      !idempotencyKeyPattern.test(idempotencyKey)
    ) {
      throw new FinanceError('CLOSING_REQUEST_INVALID');
    }
    const canonical = canonicalDailyClosingRequest(input);
    const hashes = {
      idempotencyKeyHash: sha256(idempotencyKey),
      requestHash: sha256(canonical),
    };

    try {
      return await this.client.$transaction(
        (transaction) =>
          this.createInTransaction(transaction, actorUserId, canonical, hashes),
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

  /**
   * Reopen a closing (DEC-025).
   *
   * Approved: an authorized actor reopens with a reason, and the actor, the
   * timestamp and the full history are preserved with an audit event; nothing
   * is deleted. Resolved on 2026-08-29: the window is configurable, a later
   * closing does not block reopening because each closing keeps its own frozen
   * figures, and a reopened closing stays reopened. Re-closing is not
   * supported, and the database enforces that.
   */
  async reopen(
    actorUserId: string,
    closingId: string,
    reason: string,
    idempotencyKey: string | undefined,
  ): Promise<DailyClosingView> {
    if (
      idempotencyKey === undefined ||
      !idempotencyKeyPattern.test(idempotencyKey)
    ) {
      throw new FinanceError('CLOSING_REQUEST_INVALID');
    }
    const canonical = canonicalReopeningRequest(closingId, reason);
    const hashes = {
      idempotencyKeyHash: sha256(idempotencyKey),
      requestHash: sha256(canonical),
    };

    try {
      return await this.client.$transaction(
        (transaction) =>
          this.reopenInTransaction(
            transaction,
            actorUserId,
            closingId,
            JSON.parse(canonical).reason as string,
            hashes,
          ),
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
      throw new FinanceError('CLOSING_PERMISSION_DENIED');
    }
  }

  private async createInTransaction(
    transaction: TransactionClient,
    actorUserId: string,
    canonical: string,
    hashes: { idempotencyKeyHash: string; requestHash: string },
  ): Promise<DailyClosingView> {
    const request = JSON.parse(canonical) as {
      businessDate: string;
      observations: string | null;
      realCash: string;
      realDigital: string;
    };
    await this.authorize(transaction, actorUserId, 'closings.create');

    const scope = `closings.create:${actorUserId}:${hashes.idempotencyKeyHash}`;
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))
    `;
    const replay = await transaction.dailyClosing.findUnique({
      select: { id: true, requestHash: true },
      where: {
        closedByUserId_idempotencyKeyHash: {
          closedByUserId: actorUserId,
          idempotencyKeyHash: hashes.idempotencyKeyHash,
        },
      },
    });
    if (replay) {
      if (replay.requestHash !== hashes.requestHash) {
        throw new FinanceError('FINANCE_CONCURRENCY_CONFLICT');
      }
      return this.loadClosing(transaction, replay.id);
    }

    const businessDate = civilDateUtc(request.businessDate);
    const existing = await transaction.dailyClosing.findUnique({
      select: { id: true },
      where: { businessDate },
    });
    if (existing) throw new FinanceError('CLOSING_ALREADY_EXISTS');

    const { inTransitSaleCount, systemSales } = await daySalesFigures(
      transaction,
      request.businessDate,
    );

    const calculation = calculateClosing({
      realCash: request.realCash,
      realDigital: request.realDigital,
      systemSales,
      tolerance: this.settings.tolerance,
    });

    const closedAt = this.clock.now();
    const closing = await transaction.dailyClosing.create({
      data: {
        balanced: calculation.balanced,
        businessDate,
        closedAt,
        closedByUserId: actorUserId,
        currencyCode: 'NIO',
        difference: calculation.difference,
        idempotencyKeyHash: hashes.idempotencyKeyHash,
        inTransitSaleCount,
        observations: request.observations,
        origin: 'OPERATIONAL',
        realCash: calculation.realCash,
        realDigital: calculation.realDigital,
        requestHash: hashes.requestHash,
        status: 'CLOSED',
        systemSales: calculation.systemSales,
        toleranceApplied: calculation.toleranceApplied,
      },
      select: { id: true },
    });

    await this.audit.recordClosingCreated(transaction, {
      actorUserId,
      balanced: calculation.balanced,
      businessDate: request.businessDate,
      closingId: closing.id,
      difference: calculation.difference,
      inTransitSaleCount,
      occurredAt: closedAt,
      systemSales: calculation.systemSales,
      toleranceApplied: calculation.toleranceApplied,
    });

    return this.loadClosing(transaction, closing.id);
  }

  private async reopenInTransaction(
    transaction: TransactionClient,
    actorUserId: string,
    closingId: string,
    reason: string,
    hashes: { idempotencyKeyHash: string; requestHash: string },
  ): Promise<DailyClosingView> {
    await this.authorize(transaction, actorUserId, 'closings.reopen');

    const scope = `closings.reopen:${actorUserId}:${hashes.idempotencyKeyHash}`;
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))
    `;
    const claimed = await transaction.dailyClosingReopening.findUnique({
      select: { closingId: true, requestHash: true },
      where: {
        reopenedByUserId_idempotencyKeyHash: {
          idempotencyKeyHash: hashes.idempotencyKeyHash,
          reopenedByUserId: actorUserId,
        },
      },
    });
    if (claimed) {
      if (claimed.requestHash !== hashes.requestHash) {
        throw new FinanceError('FINANCE_CONCURRENCY_CONFLICT');
      }
      return this.loadClosing(transaction, claimed.closingId);
    }

    const rows = await transaction.$queryRawUnsafe<
      { business_date: Date; status: string }[]
    >(
      `SELECT business_date, status::text AS status FROM daily_closings
       WHERE id = $1::uuid FOR UPDATE`,
      closingId,
    );
    const closing = rows[0];
    if (!closing) throw new FinanceError('CLOSING_NOT_FOUND');
    // A reopened closing stays reopened; re-closing is not supported.
    if (closing.status !== 'CLOSED') {
      throw new FinanceError('CLOSING_ALREADY_REOPENED');
    }

    // The reopening window is configured in days after the business date
    // (DEC-025). The deadline is the end of the last allowed day.
    const deadline = new Date(closing.business_date);
    deadline.setUTCDate(
      deadline.getUTCDate() + this.settings.reopeningWindowDays + 1,
    );
    if (this.clock.now() >= deadline) {
      throw new FinanceError('CLOSING_REOPENING_WINDOW_EXPIRED');
    }

    const reopenedAt = this.clock.now();
    const reopening = await transaction.dailyClosingReopening.create({
      data: {
        closingId,
        idempotencyKeyHash: hashes.idempotencyKeyHash,
        reason,
        reopenedAt,
        reopenedByUserId: actorUserId,
        requestHash: hashes.requestHash,
      },
      select: { id: true },
    });
    // The document must exist before the status changes; the database
    // enforces that and keeps every recorded figure frozen.
    await transaction.$executeRawUnsafe(
      `UPDATE daily_closings SET status = 'REOPENED' WHERE id = $1::uuid`,
      closingId,
    );

    await this.audit.recordClosingReopened(transaction, {
      actorUserId,
      closingId,
      occurredAt: reopenedAt,
      reason,
      reopeningId: reopening.id,
    });

    return this.loadClosing(transaction, closingId);
  }
}
