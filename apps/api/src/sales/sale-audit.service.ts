import type { DatabaseClient } from '@sgi/database';

type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;

export type SaleLineAuditEntry = {
  balanceAfter: string;
  balanceBefore: string;
  movementId: string;
  productId: string;
  quantity: string;
  saleItemId: string;
  warehouseId: string;
};

export type SalePriceOverrideAuditEntry = {
  appliedUnitPrice: string;
  productId: string;
  referenceUnitPrice: string | null;
  warehouseId: string;
};

export type SaleReviewFlagAuditEntry = {
  costReviewRequired: boolean;
  priceReviewRequired: boolean;
  productId: string;
  warehouseId: string;
};

export type SaleCreatedAuditInput = {
  actorUserId: string;
  lines: SaleLineAuditEntry[];
  occurredAt: Date;
  priceOverrides: SalePriceOverrideAuditEntry[];
  reviewFlags: SaleReviewFlagAuditEntry[];
  saleId: string;
  saleNumber: string;
  sellerUserId: string | null;
  shippingAmount: string;
  status: string;
  subtotal: string;
  total: string;
};

/**
 * Sales audit events. Metadata is sanitized by construction: the idempotency
 * key, request hashes, cookies, tokens, delivery place, legacy raw text, and
 * customer data are never recorded (plan §12).
 */
export class SaleAuditService {
  async recordCreated(
    transaction: TransactionClient,
    input: SaleCreatedAuditInput,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action: 'sales.created',
        actorUserId: input.actorUserId,
        entityId: input.saleId,
        entityType: 'Sale',
        metadata: {
          lines: input.lines,
          priceOverrides: input.priceOverrides,
          reviewFlags: input.reviewFlags,
          saleNumber: input.saleNumber,
          sellerUserId: input.sellerUserId,
          shippingAmount: input.shippingAmount,
          status: input.status,
          subtotal: input.subtotal,
          total: input.total,
        },
        occurredAt: input.occurredAt,
      },
    });
  }
}
