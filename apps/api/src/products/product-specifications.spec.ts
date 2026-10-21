import { productPhotosFolderUrl, type ProductInput } from '@sgi/contracts';
import type { Prisma } from '@sgi/database';
import { describe, expect, it, vi } from 'vitest';
import {
  canEditProductSpecifications,
  resolveProductSpecifications,
} from './product-specifications.js';

const base: ProductInput = {
  code: 'SYNTHETIC',
  name: 'Synthetic product',
  unitId: 'unit',
  groupId: 'group',
  minimumStock: '0',
};
describe('safe product specifications', () => {
  it.each([
    'https://drive.google.com/drive/folders/synthetic_123?usp=sharing',
    'https://drive.google.com/drive/u/0/folders/synthetic-123',
  ])('accepts an explicit HTTPS Drive folder: %s', (url) => {
    expect(productPhotosFolderUrl(` ${url} `, URL)).toEqual({
      valid: true,
      value: url,
    });
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'http://drive.google.com/drive/folders/test',
    'https://drive.google.com.evil.invalid/drive/folders/test',
    'https://drive.google.com@evil.invalid/drive/folders/test',
    'https://user:password@drive.google.com/drive/folders/test',
    'https://drive.google.com:8443/drive/folders/test',
    'https://drive.google.com/file/d/test/view',
    'https://drive.google.com/',
    'https://example.invalid/photos',
    'https://localhost/drive/folders/test',
    'https://drive.google.com/drive/folders/%2Ftest',
    'https://drive.google.com/drive/\nfolders/test',
    'https://drive.google.com/drive/folders/' + 'x'.repeat(1024),
    7,
    {},
    [],
  ])('rejects unsafe, non-folder or non-string URL %j', (url) => {
    expect(productPhotosFolderUrl(url, URL)).toEqual({ valid: false });
  });
  it('preserves omitted values and explicitly clears blank or null values', () => {
    const before = {
      materialsDescription: 'Original',
      measurementChart: 'Pecho: 10 cm',
      photosUrl: 'https://drive.google.com/drive/folders/synthetic',
    };
    expect(resolveProductSpecifications(base, before)).toEqual(before);
    expect(
      resolveProductSpecifications(
        {
          ...base,
          materialsDescription: '  ',
          measurementChart: null,
          photosUrl: '',
        },
        before,
      ),
    ).toEqual({
      materialsDescription: null,
      measurementChart: null,
      photosUrl: null,
    });
    expect(
      resolveProductSpecifications({
        ...base,
        materialsDescription: ' A\nB ',
        measurementChart: ' 10 cm ',
      }),
    ).toMatchObject({
      materialsDescription: 'A\nB',
      measurementChart: '10 cm',
    });
  });
  it.each([
    { materialsDescription: 'x'.repeat(4001) },
    { measurementChart: 'x'.repeat(8001) },
    { photosUrl: 'ftp://test.invalid' },
  ])('enforces limits in the service, not only DTOs', (fields) => {
    expect(() =>
      resolveProductSpecifications({ ...base, ...fields }),
    ).toThrowError(expect.objectContaining({ code: 'STOCK_REQUEST_INVALID' }));
  });
  it.each([
    ['ACTIVE', true, true, true],
    ['ACTIVE', true, false, false],
    ['DISABLED', true, true, false],
    ['ACTIVE', false, true, false],
  ] as const)(
    'checks active state and effective grants, never a role or username shortcut',
    async (status, activated, allowed, expected) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            status,
            activatedAt: activated ? new Date() : null,
          }),
        },
        $queryRaw: vi.fn().mockResolvedValue([{ allowed }]),
      } as unknown as Prisma.TransactionClient;
      expect(await canEditProductSpecifications(tx, 'actor')).toBe(expected);
    },
  );
});
