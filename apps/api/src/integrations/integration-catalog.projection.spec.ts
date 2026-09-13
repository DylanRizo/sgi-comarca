import type {
  InventoryBalanceView,
  ProductInventoryView,
} from '@sgi/contracts';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { projectCatalogItem } from './integration-catalog.projection.js';

function balance(
  overrides: Partial<InventoryBalanceView> = {},
): InventoryBalanceView {
  return {
    costReviewRequired: false,
    currentUnitCost: '128.50',
    currentUnitPrice: '300.00',
    id: randomUUID(),
    priceReviewRequired: false,
    quantity: '2.0000',
    valuations: [],
    warehouse: {
      active: true,
      code: 'CASA_DYLAN',
      id: randomUUID(),
      name: 'Casa Dylan',
    },
    ...overrides,
  };
}

function view(balances: InventoryBalanceView[]): ProductInventoryView {
  return {
    balances,
    product: {
      active: true,
      code: 'CMP-NEG-M',
      createdAt: '2026-09-11T00:00:00.000Z',
      description: 'Camisa de compresión manga corta negra',
      id: randomUUID(),
      minimumStock: '2',
      name: 'CAMISA DE COMPRESIÓN MANGA CORTA NEGRA M',
      unit: null,
      updatedAt: '2026-09-11T00:00:00.000Z',
    },
    totalQuantity: '4.0000',
  };
}

describe('projectCatalogItem', () => {
  it('publishes the single price every stocked warehouse agrees on', () => {
    const item = projectCatalogItem(
      view([balance(), balance({ currentUnitPrice: '300' })]),
    );
    expect(item.unitPrice).toBe('300.00');
    expect(item.priceIssue).toBeNull();
    expect(item.code).toBe('CMP-NEG-M');
    expect(item.totalQuantity).toBe('4.0000');
  });

  it('holds the price back when warehouses disagree', () => {
    const item = projectCatalogItem(
      view([balance(), balance({ currentUnitPrice: '320.00' })]),
    );
    expect(item.unitPrice).toBeNull();
    expect(item.priceIssue).toBe('MIXED');
  });

  it('holds the price back while a stocked warehouse is under review', () => {
    const item = projectCatalogItem(
      view([balance(), balance({ priceReviewRequired: true })]),
    );
    expect(item.unitPrice).toBeNull();
    expect(item.priceIssue).toBe('REVIEW');
  });

  it('reports a missing price instead of inventing one', () => {
    const item = projectCatalogItem(
      view([balance({ currentUnitPrice: null })]),
    );
    expect(item.unitPrice).toBeNull();
    expect(item.priceIssue).toBe('MISSING');
  });

  it('prefers REVIEW over MISSING so the reason points at the real fix', () => {
    const item = projectCatalogItem(
      view([
        balance({ currentUnitPrice: null }),
        balance({ priceReviewRequired: true }),
      ]),
    );
    expect(item.priceIssue).toBe('REVIEW');
  });

  it('ignores a warehouse without stock when comparing prices', () => {
    const item = projectCatalogItem(
      view([
        balance(),
        balance({ currentUnitPrice: '999.00', quantity: '0.0000' }),
      ]),
    );
    expect(item.unitPrice).toBe('300.00');
    expect(item.priceIssue).toBeNull();
  });

  it('never carries cost, valuations or warehouse detail', () => {
    const item = projectCatalogItem(view([balance()]));
    expect(Object.keys(item).sort()).toEqual(
      [
        'code',
        'description',
        'name',
        'priceIssue',
        'totalQuantity',
        'unitPrice',
      ].sort(),
    );
    expect(JSON.stringify(item)).not.toContain('128.50');
  });
});
