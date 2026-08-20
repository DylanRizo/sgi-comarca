import type { InventoryMovementView, PaginatedData } from '@sgi/contracts';
import type { DatabaseClient } from '@sgi/database';

import { pageOffset, pageResult } from '../common/pagination.js';
import type { InventoryMovementQueryDto } from './dto/inventory-movement-query.dto.js';

export class InventoryMovementNotFoundError extends Error {
  constructor() {
    super('Inventory movement was not found.');
    this.name = 'InventoryMovementNotFoundError';
  }
}

const movementInclude = {
  actor: { select: { displayName: true, id: true } },
  product: { select: { code: true, id: true, name: true } },
  transferItem: {
    include: {
      transfer: {
        include: {
          fromWarehouse: true,
          toWarehouse: true,
        },
      },
    },
  },
  warehouse: true,
} as const;

function warehouseView(warehouse: {
  active: boolean;
  code: string;
  id: string;
  name: string;
}) {
  return {
    active: warehouse.active,
    code: warehouse.code,
    id: warehouse.id,
    name: warehouse.name,
  };
}

function movementView(
  movement: Awaited<
    ReturnType<DatabaseClient['inventoryMovement']['findMany']>
  >[number] & {
    actor: { displayName: string; id: string } | null;
    product: { code: string; id: string; name: string };
    transferItem: null | {
      id: string;
      transfer: {
        id: string;
        fromWarehouse: {
          active: boolean;
          code: string;
          id: string;
          name: string;
        };
        toWarehouse: {
          active: boolean;
          code: string;
          id: string;
          name: string;
        };
      };
    };
    warehouse: {
      active: boolean;
      code: string;
      id: string;
      name: string;
    };
  },
): InventoryMovementView {
  return {
    actor: movement.actor,
    balanceAfter: movement.balanceAfter.toString(),
    balanceBefore: movement.balanceBefore.toString(),
    createdAt: movement.createdAt.toISOString(),
    id: movement.id,
    observation: movement.observation,
    occurredAt: movement.occurredAt.toISOString(),
    product: movement.product,
    quantityDelta: movement.quantityDelta.toString(),
    sourceId: movement.sourceId,
    sourceType: movement.sourceType,
    transfer: movement.transferItem
      ? {
          fromWarehouse: warehouseView(
            movement.transferItem.transfer.fromWarehouse,
          ),
          toWarehouse: warehouseView(
            movement.transferItem.transfer.toWarehouse,
          ),
          transferId: movement.transferItem.transfer.id,
          transferItemId: movement.transferItem.id,
        }
      : null,
    type: movement.type,
    warehouse: warehouseView(movement.warehouse),
  };
}

export class InventoryMovementReadService {
  constructor(private readonly database: DatabaseClient) {}

  async list(
    input: InventoryMovementQueryDto,
  ): Promise<PaginatedData<InventoryMovementView>> {
    const where = {
      ...(input.actorId ? { actorUserId: input.actorId } : {}),
      ...(input.movementType ? { type: input.movementType } : {}),
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.sourceType ? { sourceType: input.sourceType.trim() } : {}),
      ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
      ...(input.from || input.to
        ? {
            occurredAt: {
              ...(input.from ? { gte: new Date(input.from) } : {}),
              ...(input.to ? { lte: new Date(input.to) } : {}),
            },
          }
        : {}),
    };
    const [totalItems, movements] = await Promise.all([
      this.database.inventoryMovement.count({ where }),
      this.database.inventoryMovement.findMany({
        include: movementInclude,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: pageOffset(input),
        take: input.pageSize,
        where,
      }),
    ]);
    return pageResult(movements.map(movementView), totalItems, input);
  }

  async get(id: string): Promise<InventoryMovementView> {
    const movement = await this.database.inventoryMovement.findUnique({
      include: movementInclude,
      where: { id },
    });
    if (!movement) throw new InventoryMovementNotFoundError();
    return movementView(movement);
  }
}
