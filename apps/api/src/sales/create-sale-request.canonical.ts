import type { CreateSaleRequest } from '@sgi/contracts';
import { createHash } from 'node:crypto';

import {
  inventoryDecimalString,
  inventoryScaledInteger,
} from '../inventory/inventory-quantity.js';
import { centsToMoney, moneyToCents } from './sale-money.js';
import { SaleError } from './sale.errors.js';

const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

interface CanonicalLine {
  productId: string;
  quantity: string;
  unitPrice: string | null;
  warehouseId: string;
}

interface CanonicalCreateSaleRequest {
  businessDate: string;
  items: CanonicalLine[];
  sellerUserId: string | null;
  shippingAmount: string;
  status: 'IN_TRANSIT' | 'COMPLETED';
}

function canonicalUuid(value: string): string {
  const normalized = value.toLowerCase();
  if (!uuidPattern.test(normalized)) {
    throw new SaleError('SALES_REQUEST_INVALID');
  }
  return normalized;
}

function canonicalQuantity(value: string): string {
  const scaled = inventoryScaledInteger(value);
  if (scaled === null || scaled <= 0n) {
    throw new SaleError('SALES_REQUEST_INVALID');
  }
  return inventoryDecimalString(scaled);
}

function canonicalOptionalPrice(value: string | undefined): string | null {
  if (value === undefined) return null;
  const cents = moneyToCents(value);
  if (cents === null) {
    throw new SaleError('SALES_REQUEST_INVALID');
  }
  return centsToMoney(cents);
}

function canonicalShipping(value: string | undefined): string {
  if (value === undefined) return centsToMoney(0n);
  const cents = moneyToCents(value);
  if (cents === null) {
    throw new SaleError('SALES_REQUEST_INVALID');
  }
  return centsToMoney(cents);
}

/**
 * Build the canonical creation request used for the actor-scoped idempotency
 * request hash (plan §9). It contains only validated, semantically-ordered
 * business inputs: the item order is preserved as the shipping-allocation
 * ordinal, so it is part of the canonical form. Actor, key, timestamps, the
 * generated sale number, and any value read from the balance are excluded.
 */
export function canonicalCreateSaleRequest(input: CreateSaleRequest): string {
  if (
    typeof input.businessDate !== 'string' ||
    !businessDatePattern.test(input.businessDate)
  ) {
    throw new SaleError('SALES_REQUEST_INVALID');
  }
  if (input.status !== 'IN_TRANSIT' && input.status !== 'COMPLETED') {
    throw new SaleError('SALES_REQUEST_INVALID');
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new SaleError('SALES_REQUEST_INVALID');
  }

  const items: CanonicalLine[] = input.items.map((item) => ({
    productId: canonicalUuid(item.productId),
    quantity: canonicalQuantity(item.quantity),
    unitPrice: canonicalOptionalPrice(item.unitPrice),
    warehouseId: canonicalUuid(item.warehouseId),
  }));

  const canonical: CanonicalCreateSaleRequest = {
    businessDate: input.businessDate,
    items,
    sellerUserId:
      input.sellerUserId === undefined
        ? null
        : canonicalUuid(input.sellerUserId),
    shippingAmount: canonicalShipping(input.shippingAmount),
    status: input.status,
  };

  return JSON.stringify(canonical);
}

/** Lowercase SHA-256 of the canonical creation request (idempotency §9). */
export function createSaleRequestHash(input: CreateSaleRequest): string {
  return createHash('sha256')
    .update(canonicalCreateSaleRequest(input), 'utf8')
    .digest('hex');
}
