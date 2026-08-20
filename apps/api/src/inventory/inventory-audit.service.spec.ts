import type { DatabaseClient } from '@sgi/database';
import { describe, expect, it, vi } from 'vitest';

import { InventoryAuditService } from './inventory-audit.service.js';

type TransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction'
>;

describe('InventoryAuditService', () => {
  it('records one sanitized inventory movement audit event', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit-id' });
    const transaction = {
      auditLog: { create },
    } as unknown as TransactionClient;
    const occurredAt = new Date('2026-08-16T12:00:00.000Z');

    await new InventoryAuditService().recordAdjustment(transaction, {
      actorUserId: '00000000-0000-4000-8000-000000000001',
      balanceAfter: '12',
      balanceBefore: '10',
      movementId: '00000000-0000-4000-8000-000000000002',
      occurredAt,
      productId: '00000000-0000-4000-8000-000000000003',
      quantityDelta: '2',
      reason: 'Conteo controlado',
      warehouseId: '00000000-0000-4000-8000-000000000004',
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'inventory.adjusted',
        entityType: 'InventoryMovement',
        occurredAt,
      }),
    });
    expect(JSON.stringify(create.mock.calls)).not.toMatch(
      /password|cookie|csrf|token/iu,
    );
  });
});
