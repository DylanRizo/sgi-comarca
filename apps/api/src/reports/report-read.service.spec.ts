import type { DatabaseClient } from '@sgi/database';
import { describe, expect, it, vi } from 'vitest';

import { ReportReadService } from './report-read.service.js';

describe('ReportReadService CSV and pagination reads', () => {
  it('inventory: paginates for json reads and uses full dataset limit without skip for csv export', async () => {
    const count = vi.fn().mockResolvedValue(100);
    const findMany = vi.fn().mockResolvedValue([]);
    const database = {
      inventoryBalance: { count, findMany },
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
    const lastCallArg = findMany.mock.calls.at(-1)?.[0];
    expect(lastCallArg).not.toHaveProperty('skip');
    expect(lastCallArg).toMatchObject({
      take: 10_000,
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
      take: 10_000,
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
      take: 10_000,
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
      take: 10_000,
    });
  });
});
