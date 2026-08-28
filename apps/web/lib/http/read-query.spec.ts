import { describe, expect, it } from 'vitest';

import { searchQueryString } from './query.js';
import { presentReadError } from './read-error.js';

describe('searchQueryString', () => {
  it('serializes search, filters and pagination deterministically', () => {
    expect(
      searchQueryString({
        active: true,
        availableOnly: false,
        page: 2,
        pageSize: 25,
        search: 'DGGR-X',
      }),
    ).toBe('?active=true&availableOnly=false&page=2&pageSize=25&search=DGGR-X');
  });

  it('omits absent and empty values instead of sending them', () => {
    expect(searchQueryString({ page: 1, status: '', to: undefined })).toBe(
      '?page=1',
    );
  });

  it('rejects a value it cannot serialize safely', () => {
    expect(() => searchQueryString({ items: [1, 2] })).toThrow();
  });
});

describe('presentReadError', () => {
  it('maps forbidden and internal failures to safe UI messages', () => {
    expect(presentReadError({ status: 403 })).toMatchObject({
      title: 'Sin permiso de lectura',
      tone: 'warning',
    });
    expect(presentReadError(new Error('database unavailable'))).toMatchObject({
      title: 'Error de consulta',
      tone: 'error',
    });
  });

  it('names the permission the surface actually requires', () => {
    expect(presentReadError({ status: 403 }, 'sales.read').message).toContain(
      'sales.read',
    );
    expect(presentReadError({ status: 403 }).message).toContain(
      'inventory.read',
    );
  });
});
