import type { Prisma } from '@sgi/database';

/**
 * The single column set every sale read uses, shared by the read service, the
 * creation service and the lifecycle service.
 *
 * It lived inline in all three, which is how a column added to one of them was
 * silently missing from the others. One definition means a field reaches every
 * sale response or none of them.
 *
 * Only read-safe columns appear. `unitCostSnapshot`, the idempotency and
 * request hashes, and `legacySellerText` are never selected, so they cannot
 * leak through the read surface (ADR-009, plan §3).
 *
 * The logistics columns are selected: FASE 7A created them to preserve legacy
 * text, and the business also captures them on new sales — the courier needs
 * to read back the address and channel of the order being delivered.
 * `deliveryPlace` stops here. It is readable on a single sale and stays out of
 * every report and CSV export, because a bulk file of customer addresses is a
 * different thing from an operator opening one order (FASE 9 plan §5).
 */
export const saleSelect = {
  businessDate: true,
  completedAt: true,
  createdAt: true,
  currencyCode: true,
  delivererText: true,
  deliveryPlace: true,
  departureAt: true,
  id: true,
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      lineSubtotal: true,
      product: { select: { code: true, id: true, name: true } },
      quantity: true,
      shippingAllocation: true,
      unitPriceSnapshot: true,
      warehouse: {
        select: { active: true, code: true, id: true, name: true },
      },
    },
  },
  observations: true,
  origin: true,
  paymentMethodText: true,
  paymentStatus: true,
  saleNumber: true,
  salesChannelText: true,
  sellerUserId: true,
  shippingAmount: true,
  status: true,
  subtotal: true,
  total: true,
} satisfies Prisma.SaleSelect;
