import type {
  ProductInventoryView,
  ProductSummary,
  WarehouseSummary,
} from '@sgi/contracts';

import { normalizeSpokenValue } from './catalog-resolution.js';
import type { InventoryLookupPort } from './inventory-lookup.port.js';

const demoUnit = {
  active: true,
  code: 'UNIDADES',
  id: '00000000-0000-4000-8000-000000000001',
  name: 'unidades',
};

const demoProducts: readonly ProductSummary[] = [
  {
    active: true,
    code: 'DEMO-CAFE',
    id: '00000000-0000-4000-8000-000000000101',
    minimumStock: '3',
    name: 'Café molido demo',
    unit: demoUnit,
  },
  {
    active: true,
    code: 'DEMO-CAFE-GRANDE',
    id: '00000000-0000-4000-8000-000000000102',
    minimumStock: '2',
    name: 'Café molido demo grande',
    unit: demoUnit,
  },
];

const demoWarehouses: readonly WarehouseSummary[] = [
  {
    active: true,
    code: 'CASA_DYLAN',
    id: '00000000-0000-4000-8000-000000000201',
    name: 'Casa Dylan',
  },
  {
    active: true,
    code: 'CASA_LUDEN',
    id: '00000000-0000-4000-8000-000000000202',
    name: 'Casa Luden',
  },
];

function containsSpokenValue(
  candidate: { code: string; name: string },
  query: string,
): boolean {
  const normalized = normalizeSpokenValue(query);
  return (
    normalizeSpokenValue(candidate.code).includes(normalized) ||
    normalizeSpokenValue(candidate.name).includes(normalized)
  );
}

export class DemoInventoryGateway implements InventoryLookupPort {
  async searchProducts(query: string): Promise<readonly ProductSummary[]> {
    return demoProducts.filter((product) =>
      containsSpokenValue(product, query),
    );
  }

  async searchWarehouses(query: string): Promise<readonly WarehouseSummary[]> {
    return demoWarehouses.filter((warehouse) =>
      containsSpokenValue(warehouse, query),
    );
  }

  async getProductInventory(
    productId: string,
    warehouseId: string,
  ): Promise<ProductInventoryView> {
    const product = demoProducts.find(
      (candidate) => candidate.id === productId,
    );
    if (!product) throw new Error('Demo product was not found.');
    const warehouse = demoWarehouses.find(
      (candidate) => candidate.id === warehouseId,
    );
    if (!warehouse) throw new Error('Demo warehouse was not found.');

    const hasDemoBalance = product.code === 'DEMO-CAFE';
    const quantity = warehouse.code === 'CASA_DYLAN' ? '12.5' : '0';
    return {
      balances: hasDemoBalance
        ? [
            {
              canReadCost: false,
              costReviewRequired: false,
              currentUnitCost: null,
              currentUnitPrice: null,
              id: '00000000-0000-4000-8000-000000000301',
              priceReviewRequired: false,
              quantity,
              valuations: [],
              warehouse,
            },
          ]
        : [],
      product: {
        ...product,
        createdAt: '2026-01-01T00:00:00.000Z',
        description: 'Dato sintético para el simulador local.',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      totalQuantity: hasDemoBalance ? quantity : '0',
    };
  }
}
