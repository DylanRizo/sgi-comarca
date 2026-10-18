import type { DatabaseClient } from '@sgi/database';
import { describe, expect, it, vi } from 'vitest';

import { ReportReadService } from './report-read.service.js';

describe('ReportReadService CSV and pagination reads', () => {
  it('inventory: paginates for json reads and uses full dataset limit without skip for csv export', async () => {
    const count = vi.fn().mockResolvedValue(100);
    const findMany = vi.fn().mockResolvedValue([]);
    const productCount = vi.fn().mockResolvedValue(0);
    const productFindMany = vi.fn().mockResolvedValue([]);
    const database = {
      inventoryBalance: { count, findMany },
      product: { count: productCount, findMany: productFindMany },
    } as unknown as DatabaseClient;
    const service = new ReportReadService(database);

    // Standard paginated JSON read
    await service.inventory({ page: 2, pageSize: 25, format: 'json' }, true);
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        skip: 25,
        take: 25,
      }),
    );

    // Full CSV export
    await service.inventory({ page: 1, pageSize: 25, format: 'csv' }, true);
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 10_001 }),
    );
    expect(findMany.mock.calls.at(-1)?.[0]).not.toHaveProperty('skip');
    expect(productCount).toHaveBeenCalledWith({
      where: { inventoryBalances: { none: {} } },
    });
  });

  it('movements: omits skip and uses full dataset limit for csv export', async () => {
    const count = vi.fn().mockResolvedValue(50);
    const findMany = vi.fn().mockResolvedValue([]);
    const database = {
      inventoryMovement: { count, findMany },
    } as unknown as DatabaseClient;
    const service = new ReportReadService(database);

    await service.movements({
      page: 1,
      pageSize: 25,
      format: 'csv',
    });
    const lastCallArg = findMany.mock.calls.at(-1)?.[0];
    expect(lastCallArg).not.toHaveProperty('skip');
    expect(lastCallArg).toMatchObject({
      take: 10_001,
    });
  });

  it('sales: omits skip and uses full dataset limit for csv export', async () => {
    const count = vi.fn().mockResolvedValue(75);
    const findMany = vi.fn().mockResolvedValue([]);
    const database = {
      sale: { count, findMany },
    } as unknown as DatabaseClient;
    const service = new ReportReadService(database);

    await service.sales({
      page: 1,
      pageSize: 25,
      format: 'csv',
    });
    const lastCallArg = findMany.mock.calls.at(-1)?.[0];
    expect(lastCallArg).not.toHaveProperty('skip');
    expect(lastCallArg).toMatchObject({
      take: 10_001,
    });
  });

  it('finances: omits skip and uses full dataset limit for csv export', async () => {
    const count = vi.fn().mockResolvedValue(40);
    const findMany = vi.fn().mockResolvedValue([]);
    const database = {
      financialEntry: { count, findMany },
    } as unknown as DatabaseClient;
    const service = new ReportReadService(database);

    await service.finances({
      page: 1,
      pageSize: 25,
      format: 'csv',
    });
    const lastCallArg = findMany.mock.calls.at(-1)?.[0];
    expect(lastCallArg).not.toHaveProperty('skip');
    expect(lastCallArg).toMatchObject({
      take: 10_001,
    });
  });

  it('rejects CSV exports above the safety limit instead of truncating them', async () => {
    const findMany = vi.fn();
    const database = {
      inventoryMovement: {
        count: vi.fn().mockResolvedValue(10_001),
        findMany,
      },
    } as unknown as DatabaseClient;
    const service = new ReportReadService(database);

    await expect(
      service.movements({ page: 1, pageSize: 25, format: 'csv' }),
    ).rejects.toMatchObject({
      status: 413,
      message: expect.stringContaining('Aplica filtros'),
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('includes catalog products without a balance as zero-stock CSV rows', async () => {
    const catalogProduct = {
      code: 'NO-STOCK-001',
      id: 'product-no-stock',
      name: 'Sin saldo',
    };
    const database = {
      inventoryBalance: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      product: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([catalogProduct]),
      },
    } as unknown as DatabaseClient;
    const service = new ReportReadService(database);

    const result = await service.inventory(
      { page: 1, pageSize: 25, format: 'csv' },
      true,
    );

    expect(result.items).toEqual([
      {
        productCode: 'NO-STOCK-001',
        productId: 'product-no-stock',
        productName: 'Sin saldo',
        quantity: '0.0000',
        stockValue: null,
        unitCost: null,
        warehouseCode: '',
        warehouseId: '',
        warehouseName: '',
      },
    ]);
  });

  it('rejects inventory CSV when balances plus catalog-only products exceed the limit', async () => {
    const balanceFindMany = vi.fn();
    const productFindMany = vi.fn();
    const database = {
      inventoryBalance: {
        count: vi.fn().mockResolvedValue(10_000),
        findMany: balanceFindMany,
      },
      product: {
        count: vi.fn().mockResolvedValue(1),
        findMany: productFindMany,
      },
    } as unknown as DatabaseClient;
    const service = new ReportReadService(database);

    await expect(
      service.inventory({ page: 1, pageSize: 25, format: 'csv' }, true),
    ).rejects.toMatchObject({ status: 413 });
    expect(balanceFindMany).not.toHaveBeenCalled();
    expect(productFindMany).not.toHaveBeenCalled();
  });

  it('detects a result that grows beyond the safety limit after the count', async () => {
    const count = vi.fn().mockResolvedValue(10_000);
    const findMany = vi.fn().mockResolvedValue(Array.from({ length: 10_001 }));
    const database = {
      inventoryMovement: { count, findMany },
    } as unknown as DatabaseClient;
    const service = new ReportReadService(database);

    await expect(
      service.movements({ page: 1, pageSize: 25, format: 'csv' }),
    ).rejects.toMatchObject({ status: 413 });
  });
});
