import type { DatabaseClient } from '@sgi/database';
import { describe, expect, it, vi } from 'vitest';

import { ProductReadService } from './product-read.service.js';

function decimal(value: string): { toString(): string } {
  return { toString: () => value };
}

describe('ProductReadService', () => {
  it('searches code/name with stable server-side pagination', async () => {
    const count = vi.fn().mockResolvedValue(2);
    const findMany = vi.fn().mockResolvedValue([
      {
        active: true,
        code: 'SYN-A',
        id: '00000000-0000-4000-8000-000000000001',
        minimumStock: decimal('2.5'),
        name: 'Synthetic A',
        unit: null,
      },
    ]);
    const database = {
      product: { count, findMany },
    } as unknown as DatabaseClient;
    const service = new ProductReadService(database);

    const result = await service.list({
      active: true,
      page: 2,
      pageSize: 1,
      search: 'syn',
    });

    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    });
    expect(result.items[0]).toMatchObject({
      code: 'SYN-A',
      minimumStock: '2.5',
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        skip: 1,
        take: 1,
        where: expect.objectContaining({ active: true, OR: expect.any(Array) }),
      }),
    );
  });

  it('returns real detail fields and rejects an unknown product', async () => {
    const product = {
      active: true,
      code: 'SYN-A',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      description: null,
      id: '00000000-0000-4000-8000-000000000001',
      minimumStock: decimal('0'),
      name: 'Synthetic A',
      unit: null,
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(product)
      .mockResolvedValueOnce(null);
    const database = { product: { findUnique } } as unknown as DatabaseClient;
    const service = new ProductReadService(database);

    await expect(service.get(product.id)).resolves.toMatchObject({
      code: 'SYN-A',
      description: null,
      minimumStock: '0',
    });
    await expect(service.get(product.id)).rejects.toMatchObject({
      resource: 'product',
    });
  });
});
