import type { SaleView, VoidDuplicateSaleRequest } from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';
import { createHash } from 'node:crypto';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import {
  restoreSaleInventory,
  type SaleTransaction,
} from './restore-sale-inventory.js';
import type { SaleClock } from './sale-lifecycle.service.js';
import { mapSale } from './sale-read.mapper.js';
import { saleSelect } from './sale-select.js';
import { SaleError } from './sale.errors.js';

const hash = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

/** ADR-021: one paid duplicate -> its already recorded, unpaid replacement. */
export class VoidDuplicateSaleService {
  constructor(
    private readonly client: DatabaseClient,
    private readonly clock: SaleClock = { now: () => new Date() },
  ) {}

  async execute(
    actorUserId: string,
    saleId: string,
    input: VoidDuplicateSaleRequest,
    key: string | undefined,
  ): Promise<SaleView> {
    if (key === undefined) throw new SaleError('IDEMPOTENCY_KEY_REQUIRED');
    if (!/^[\x21-\x7e]{16,128}$/u.test(key))
      throw new SaleError('IDEMPOTENCY_KEY_INVALID');
    const reason = input.reason?.trim() ?? '';
    const replacementSaleNumber =
      input.replacementSaleNumber?.trim().toUpperCase() ?? '';
    if (
      !reason ||
      reason.length > 500 ||
      !/^VTA-[0-9]{9}$/u.test(replacementSaleNumber) ||
      input.stockReturned !== true
    ) {
      throw new SaleError('SALES_REQUEST_INVALID');
    }
    const keyHash = hash(key);
    const requestHash = hash(
      JSON.stringify({
        operation: 'void-duplicate',
        saleId,
        replacementSaleNumber,
        reason,
        stockReturned: true,
      }),
    );
    try {
      return await this.client.$transaction(
        async (transaction) => {
          await this.authorize(transaction, actorUserId);
          const scope = `sales.cancel:${actorUserId}:${keyHash}`;
          await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
          const replay = await transaction.saleCancellation.findUnique({
            where: {
              cancelledByUserId_idempotencyKeyHash: {
                cancelledByUserId: actorUserId,
                idempotencyKeyHash: keyHash,
              },
            },
          });
          if (replay) {
            if (replay.requestHash !== requestHash)
              throw new SaleError('IDEMPOTENCY_KEY_REUSED');
            return this.load(transaction, replay.saleId);
          }
          const target = await transaction.sale.findUnique({
            where: { saleNumber: replacementSaleNumber },
            select: { id: true },
          });
          if (!target || target.id === saleId)
            throw new SaleError('SALE_DUPLICATE_TARGET_INVALID');
          const ids = [saleId, target.id].sort();
          const locked = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM sales WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE
        `;
          if (locked.length !== 2) throw new SaleError('SALE_NOT_FOUND');
          const source = await transaction.sale.findUniqueOrThrow({
            where: { id: saleId },
            include: {
              payment: true,
              cancellation: true,
              receivedPaymentCorrection: true,
            },
          });
          const replacement = await transaction.sale.findUniqueOrThrow({
            where: { id: target.id },
            include: {
              payment: true,
              cancellation: true,
              receivedPaymentCorrection: true,
            },
          });
          // A lost response/new key over exactly the same finished correction is harmless.
          if (source.cancellation?.replacementSaleId === replacement.id)
            return this.load(transaction, source.id);
          if (
            source.origin !== 'OPERATIONAL' ||
            source.status !== 'COMPLETED' ||
            source.paymentStatus !== 'PAID' ||
            !source.payment ||
            source.cancellation ||
            source.receivedPaymentCorrection
          )
            throw new SaleError('SALE_INVALID_STATE');
          if (
            replacement.origin !== 'OPERATIONAL' ||
            replacement.status !== 'COMPLETED' ||
            replacement.paymentStatus !== 'PENDING' ||
            replacement.payment ||
            replacement.cancellation ||
            replacement.receivedPaymentCorrection ||
            !source.total.equals(replacement.total) ||
            source.currencyCode !== replacement.currencyCode ||
            source.businessDate.getTime() !== replacement.businessDate.getTime()
          )
            throw new SaleError('SALE_DUPLICATE_TARGET_INVALID');
          const day = source.businessDate.toISOString().slice(0, 10);
          const dayScope = `sales.business-day:${day}`;
          await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dayScope}, 0))`;
          if (
            await transaction.dailyClosing.findUnique({
              where: { businessDate: source.businessDate },
              select: { id: true },
            })
          ) {
            throw new SaleError('SALE_DAY_ALREADY_CLOSED');
          }
          const correctedAt = this.clock.now();
          const correction = await transaction.saleCancellation.create({
            data: {
              saleId,
              replacementSaleId: replacement.id,
              reassignedPaymentId: source.payment.id,
              cancelledByUserId: actorUserId,
              cancelledAt: correctedAt,
              reason,
              idempotencyKeyHash: keyHash,
              requestHash,
            },
          });
          const lines = await restoreSaleInventory(
            transaction,
            actorUserId,
            saleId,
            correctedAt,
          );
          // Preserve both completion and the original payment evidence on the voided row.
          await transaction.sale.update({
            where: { id: saleId },
            data: { status: 'CANCELLED' },
          });
          await transaction.sale.update({
            where: { id: replacement.id },
            data: { paymentStatus: 'PAID' },
          });
          await transaction.auditLog.create({
            data: {
              action: 'sales.duplicate_voided',
              actorUserId,
              entityId: saleId,
              entityType: 'Sale',
              occurredAt: correctedAt,
              metadata: {
                correctionId: correction.id,
                replacementSaleId: replacement.id,
                paymentId: source.payment.id,
                reason,
                stockReturned: true,
                lines,
                amount: source.payment.amount.toFixed(2),
                currencyCode: source.currencyCode,
              },
            },
          });
          await transaction.auditLog.create({
            data: {
              action: 'sales.payment_reassigned',
              actorUserId,
              entityId: replacement.id,
              entityType: 'Sale',
              occurredAt: correctedAt,
              metadata: {
                correctionId: correction.id,
                sourceSaleId: saleId,
                paymentId: source.payment.id,
                previousPaymentStatus: 'PENDING',
                newPaymentStatus: 'PAID',
                newPayment: false,
              },
            },
          });
          return this.load(transaction, saleId);
        },
        { isolationLevel: 'ReadCommitted', timeout: 15_000 },
      );
    } catch (error) {
      if (error instanceof SaleError) throw error;
      if (
        (error &&
          typeof error === 'object' &&
          'code' in error &&
          ['P2002', 'P2034'].includes(String(error.code))) ||
        (error instanceof Error &&
          ['40001', '40P01', '55P03'].some((code) =>
            error.message.includes(code),
          ))
      ) {
        throw new SaleError('SALE_CONCURRENCY_CONFLICT');
      }
      throw error;
    }
  }

  private async authorize(
    transaction: SaleTransaction,
    actorUserId: string,
  ): Promise<void> {
    const actor = await transaction.user.findUnique({
      where: { id: actorUserId },
      select: {
        status: true,
        activatedAt: true,
        userRoles: {
          where: { revokedAt: null, role: { code: 'ADMIN' } },
          select: { id: true },
        },
      },
    });
    if (
      !actor ||
      actor.status !== 'ACTIVE' ||
      !actor.activatedAt ||
      !actor.userRoles.length ||
      !(await new EffectivePermissionsService(this.client).hasPermissionUsing(
        transaction,
        actorUserId,
        'sales.cancel',
      ))
    ) {
      throw new SaleError('SALES_PERMISSION_DENIED');
    }
  }

  private async load(
    transaction: SaleTransaction,
    id: string,
  ): Promise<SaleView> {
    const sale = await transaction.sale.findUnique({
      where: { id },
      select: saleSelect,
    });
    if (!sale) throw new SaleError('SALE_NOT_FOUND');
    return mapSale(sale);
  }
}
