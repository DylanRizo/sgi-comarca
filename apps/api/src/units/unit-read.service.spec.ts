import type { DatabaseClient } from '@sgi/database';
import { describe, expect, it, vi } from 'vitest';

import { UnitReadService } from './unit-read.service.js';

describe('UnitReadService', () => {
  it('lists and resolves units using deterministic order', async () => {
    const unit = { active: true, code: 'UNIT', id: 'u', name: 'Unit' };
    const findMany = vi.fn().mockResolvedValue([unit]);
    const database = {
      unit: {
        count: vi.fn().mockResolvedValue(1),
        findMany,
        findUnique: vi.fn().mockResolvedValue(unit),
      },
    } as unknown as DatabaseClient;
    const service = new UnitReadService(database);

    await expect(
      service.list({ page: 1, pageSize: 25 }),
    ).resolves.toMatchObject({ items: [unit], pagination: { totalItems: 1 } });
    await expect(service.get('u')).resolves.toEqual(unit);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    );
  });
});
