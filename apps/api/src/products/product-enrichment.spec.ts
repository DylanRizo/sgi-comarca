import type { DatabaseClient } from '@sgi/database';
import { describe, expect, it, vi } from 'vitest';
import { ProductReadService } from './product-read.service.js';
import { ProductWriteService } from './product-write.service.js';
import type { StockTransaction } from '../inventory/stock-command.js';

describe('Product enrichment specs and authorization (ADR-023)', () => {
  it('exposes technical specifications and multimedia in ProductReadService.get', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      code: 'CMP-NEG-M',
      name: 'Camisa Compresión Negra M',
      description: 'Camisa de compresión deportiva',
      materialsDescription: '85% Poliamida, 15% Elastano. Alta compresión.',
      measurementChart: 'Pecho: 95-102 cm\nCintura: 82-88 cm\nLargo: 68 cm',
      photosUrl: 'https://drive.google.com/drive/folders/test1234',
      minimumStock: { toString: () => '5' },
      active: true,
      unit: { id: 'u1', code: 'UNIDADES', name: 'Unidades', active: true },
      group: { id: 'g1', code: 'CAMISAS', name: 'Camisas', active: true },
      createdAt: new Date('2026-10-20T10:00:00.000Z'),
      updatedAt: new Date('2026-10-20T12:00:00.000Z'),
    });

    const database = {
      product: { findUnique },
    } as unknown as DatabaseClient;

    const service = new ProductReadService(database);
    const detail = await service.get('00000000-0000-4000-8000-000000000001');

    expect(detail).toMatchObject({
      code: 'CMP-NEG-M',
      materialsDescription: '85% Poliamida, 15% Elastano. Alta compresión.',
      measurementChart: 'Pecho: 95-102 cm\nCintura: 82-88 cm\nLargo: 68 cm',
      photosUrl: 'https://drive.google.com/drive/folders/test1234',
    });
  });

  it('rejects enrichment creation when actor is neither ADMIN nor luden', async () => {
    const service = new ProductWriteService({} as DatabaseClient);
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          loginIdentifier: 'samantha',
          userRoles: [],
        }),
      },
    } as unknown as StockTransaction;

    await expect(
      service.createInTransaction(tx, 'samantha-id', {
        code: 'TEST-SKU',
        name: 'Test Product',
        unitId: 'unit-1',
        groupId: 'group-1',
        minimumStock: '1',
        materialsDescription: '100% Cotton',
      }),
    ).rejects.toMatchObject({ code: 'STOCK_PERMISSION_DENIED' });
  });

  it('allows enrichment creation when actor is luden', async () => {
    const service = new ProductWriteService({} as DatabaseClient);
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          loginIdentifier: 'luden',
          userRoles: [],
        }),
      },
      unit: { findFirst: vi.fn().mockResolvedValue({ id: 'u1' }) },
      productGroup: { findFirst: vi.fn().mockResolvedValue({ id: 'g1' }) },
      $executeRaw: vi.fn().mockResolvedValue(1),
      product: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'prod-new' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    } as unknown as StockTransaction;

    const created = await service.createInTransaction(tx, 'luden-id', {
      code: 'TEST-LUDEN',
      name: 'Product Created by Luden',
      unitId: 'u1',
      groupId: 'g1',
      minimumStock: '5',
      materialsDescription: 'Spandex blend',
      measurementChart: 'Talla M: 100cm',
      photosUrl: 'https://drive.google.com/folder-luden',
    });

    expect(created.id).toBe('prod-new');
    expect(tx.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        materialsDescription: 'Spandex blend',
        measurementChart: 'Talla M: 100cm',
        photosUrl: 'https://drive.google.com/folder-luden',
      }),
    });
  });

  it('allows enrichment creation when actor is ADMIN', async () => {
    const service = new ProductWriteService({} as DatabaseClient);
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          loginIdentifier: 'dylan',
          userRoles: [{ id: 'role-admin' }],
        }),
      },
      unit: { findFirst: vi.fn().mockResolvedValue({ id: 'u1' }) },
      productGroup: { findFirst: vi.fn().mockResolvedValue({ id: 'g1' }) },
      $executeRaw: vi.fn().mockResolvedValue(1),
      product: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'prod-admin' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-2' }),
      },
    } as unknown as StockTransaction;

    const created = await service.createInTransaction(tx, 'admin-id', {
      code: 'TEST-ADMIN',
      name: 'Product Created by Admin',
      unitId: 'u1',
      groupId: 'g1',
      minimumStock: '2',
      photosUrl: 'https://drive.google.com/admin-folder',
    });

    expect(created.id).toBe('prod-admin');
  });

  it('rejects invalid photo URLs', async () => {
    const service = new ProductWriteService({} as DatabaseClient);
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          loginIdentifier: 'luden',
          userRoles: [],
        }),
      },
      unit: { findFirst: vi.fn().mockResolvedValue({ id: 'u1' }) },
      productGroup: { findFirst: vi.fn().mockResolvedValue({ id: 'g1' }) },
    } as unknown as StockTransaction;

    await expect(
      service.createInTransaction(tx, 'luden-id', {
        code: 'TEST-URL',
        name: 'Invalid URL Product',
        unitId: 'u1',
        groupId: 'g1',
        minimumStock: '1',
        photosUrl: 'ftp://invalid-scheme.com/file',
      }),
    ).rejects.toMatchObject({ code: 'STOCK_REQUEST_INVALID' });
  });
});
