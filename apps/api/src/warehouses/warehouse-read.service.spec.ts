import type { DatabaseClient } from '@sgi/database';
import { describe, expect, it, vi } from 'vitest';

import { WarehouseReadService } from './warehouse-read.service.js';

describe('WarehouseReadService', () => {
  it('lists warehouses and reports a missing detail', async () => {
    const warehouse = {
      active: true,
      code: 'W-A',
      id: 'w',
      name: 'Warehouse A',
    };
    const database = {
      warehouse: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([warehouse]),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as DatabaseClient;
    const service = new WarehouseReadService(database);

    await expect(
      service.list({ page: 1, pageSize: 25 }),
    ).resolves.toMatchObject({
      items: [warehouse],
      pagination: { totalItems: 1 },
    });
    await expect(service.get('w')).rejects.toMatchObject({
      resource: 'warehouse',
    });
  });
});
