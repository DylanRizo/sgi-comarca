import { createHash, randomBytes } from 'node:crypto';

import { createDatabaseClient } from '../../../../packages/database/src/client.js';

function requireDatabaseUrl(): string {
  const value = process.env.SGI_E2E_DATABASE_URL;
  if (!value) throw new Error('SGI_E2E_DATABASE_URL is required.');
  return value;
}

export class AuthenticationDatabase {
  private readonly client = createDatabaseClient(requireDatabaseUrl());

  async disconnect(): Promise<void> {
    await this.client.$disconnect();
  }

  async reset(): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      // Inventory movements, sales, sale items and lifecycle documents are
      // immutable. Preserve every fixture product referenced by either ledger
      // or sales history and remove only fixtures that were never used. The
      // whole E2E database is temporary and dropped by the runner, so nothing
      // accumulates across runs.
      const fixtureProducts = await transaction.product.findMany({
        select: { id: true },
        where: {
          OR: [
            { code: { startsWith: 'E2E-' } },
            { code: { in: ['DGGR-X', 'CCWH-L'] } },
          ],
          inventoryMovements: { none: {} },
          saleItems: { none: {} },
        },
      });
      const productIds = fixtureProducts.map(({ id }) => id);
      await transaction.productWarehouseValuation.deleteMany({
        where: { productId: { in: productIds } },
      });
      await transaction.inventoryBalance.deleteMany({
        where: { productId: { in: productIds } },
      });
      await transaction.product.deleteMany({
        where: { id: { in: productIds } },
      });
      await transaction.unit.deleteMany({
        where: { code: 'E2E-UNIT', products: { none: {} } },
      });
      // Financial entries and daily closings are immutable by FASE 8A
      // triggers and are never deleted; the E2E database is temporary and
      // dropped by the runner. Only remove fixture categories no entry
      // references yet.
      await transaction.financialCategory.deleteMany({
        where: { code: { startsWith: 'E2E-FIN-' }, entries: { none: {} } },
      });
      await transaction.userPermission.deleteMany({
        where: { effect: 'DENY' },
      });
      await transaction.session.deleteMany();
      await transaction.loginThrottle.deleteMany();
      await transaction.userInvitation.deleteMany();
      await transaction.passwordCredential.deleteMany();
      await transaction.user.update({
        data: { activatedAt: null, status: 'PENDING_ACTIVATION' },
        where: { loginIdentifier: 'dylan' },
      });
    });
  }

  async seedInventoryReadFixtures(): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      // A prior suite's sold or moved product can keep E2E-UNIT alive across
      // resets (products referencing it cannot be deleted), so this reuses
      // the existing row instead of assuming reset() removed it.
      const unit = await transaction.unit.upsert({
        create: { code: 'E2E-UNIT', name: 'Unidad sintética' },
        update: {},
        where: { code: 'E2E-UNIT' },
      });
      await transaction.product.createMany({
        data: [
          { code: 'DGGR-X', name: 'Producto multi-almacén', unitId: unit.id },
          { code: 'CCWH-L', name: 'Producto sin valoración', unitId: unit.id },
          ...Array.from({ length: 24 }, (_, index) => ({
            code: `E2E-${String(index + 1).padStart(3, '0')}`,
            name: `Producto sintético ${String(index + 1).padStart(3, '0')}`,
            unitId: unit.id,
          })),
        ],
      });
      const [products, warehouses] = await Promise.all([
        transaction.product.findMany({
          select: { code: true, id: true },
          where: { code: { in: ['DGGR-X', 'CCWH-L'] } },
        }),
        transaction.warehouse.findMany({
          orderBy: { code: 'asc' },
          select: { code: true, id: true },
        }),
      ]);
      const byCode = new Map(
        products.map((product) => [product.code, product]),
      );
      const warehouseByCode = new Map(
        warehouses.map((warehouse) => [warehouse.code, warehouse]),
      );
      const dggr = byCode.get('DGGR-X');
      const ccwh = byCode.get('CCWH-L');
      const dylan = warehouseByCode.get('CASA_DYLAN');
      const jean = warehouseByCode.get('CASA_JEAN');
      const luden = warehouseByCode.get('CASA_LUDEN');
      if (!dggr || !ccwh || !dylan || !jean || !luden) {
        throw new Error(
          'Synthetic inventory fixture prerequisites are missing.',
        );
      }
      await transaction.inventoryBalance.createMany({
        data: [
          {
            currentUnitCost: 0,
            currentUnitPrice: 10,
            productId: dggr.id,
            quantity: 2.5,
            warehouseId: dylan.id,
          },
          {
            currentUnitCost: 3,
            currentUnitPrice: 12,
            productId: dggr.id,
            quantity: 3.5,
            warehouseId: jean.id,
          },
          {
            costReviewRequired: true,
            currentUnitCost: null,
            currentUnitPrice: null,
            productId: ccwh.id,
            quantity: 4,
            warehouseId: luden.id,
          },
        ],
      });
      await transaction.productWarehouseValuation.create({
        data: {
          currencyCode: 'NIO',
          observedAt: new Date('2026-01-15T12:00:00.000Z'),
          productId: dggr.id,
          unitCost: 0,
          unitPrice: 10,
          warehouseId: dylan.id,
        },
      });
    });
  }

  async inventoryFixtureProductCount(): Promise<number> {
    const products = await this.client.product.findMany({
      include: { unit: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 25,
      where: { active: true },
    });
    return products.length;
  }

  async denyInventoryRead(): Promise<void> {
    const [permission, user] = await Promise.all([
      this.client.permission.findUniqueOrThrow({
        where: { code: 'inventory.read' },
      }),
      this.client.user.findUniqueOrThrow({
        where: { loginIdentifier: 'dylan' },
      }),
    ]);
    await this.client.userPermission.create({
      data: { effect: 'DENY', permissionId: permission.id, userId: user.id },
    });
  }

  async denyInventoryAdjust(): Promise<void> {
    const [permission, user] = await Promise.all([
      this.client.permission.findUniqueOrThrow({
        where: { code: 'inventory.adjust' },
      }),
      this.client.user.findUniqueOrThrow({
        where: { loginIdentifier: 'dylan' },
      }),
    ]);
    await this.client.userPermission.create({
      data: { effect: 'DENY', permissionId: permission.id, userId: user.id },
    });
  }

  async denyTransfersCreate(): Promise<void> {
    const [permission, user] = await Promise.all([
      this.client.permission.findUniqueOrThrow({
        where: { code: 'transfers.create' },
      }),
      this.client.user.findUniqueOrThrow({
        where: { loginIdentifier: 'dylan' },
      }),
    ]);
    await this.client.userPermission.create({
      data: { effect: 'DENY', permissionId: permission.id, userId: user.id },
    });
  }

  async inventoryTransferCounts(): Promise<{
    items: number;
    movements: number;
    transfers: number;
  }> {
    const [transfers, items, movements] = await Promise.all([
      this.client.inventoryTransfer.count(),
      this.client.inventoryTransferItem.count(),
      this.client.inventoryMovement.count({
        where: { type: { in: ['TRANSFER_OUT', 'TRANSFER_IN'] } },
      }),
    ]);
    return { items, movements, transfers };
  }

  async createInvitation(): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const createdAt = new Date();
    const user = await this.client.user.findUniqueOrThrow({
      select: { id: true },
      where: { loginIdentifier: 'dylan' },
    });
    await this.client.userInvitation.create({
      data: {
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1_000),
        tokenHash,
        userId: user.id,
      },
    });
    return token;
  }

  async revokeSessions(): Promise<number> {
    const user = await this.client.user.findUniqueOrThrow({
      select: { id: true },
      where: { loginIdentifier: 'dylan' },
    });
    const result = await this.client.session.updateMany({
      data: {
        revokeReason: 'E2E_CONTROLLED_REVOCATION',
        revokedAt: new Date(),
      },
      where: { revokedAt: null, userId: user.id },
    });
    return result.count;
  }

  async expireLatestSession(expiration: 'absolute' | 'idle'): Promise<void> {
    const user = await this.client.user.findUniqueOrThrow({
      select: { id: true },
      where: { loginIdentifier: 'dylan' },
    });
    await this.client.$transaction(async (transaction) => {
      const current = await transaction.session.findFirstOrThrow({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        where: { revokedAt: null, userId: user.id },
      });
      const now = new Date();
      const createdAt = new Date(
        now.getTime() - (expiration === 'absolute' ? 9 : 1) * 60 * 60 * 1_000,
      );
      const absoluteExpiresAt = new Date(
        createdAt.getTime() + 8 * 60 * 60 * 1_000,
      );
      const lastSeenAt =
        expiration === 'absolute'
          ? new Date(absoluteExpiresAt.getTime() - 30 * 60 * 1_000)
          : new Date(now.getTime() - 31 * 60 * 1_000);
      const idleExpiresAt = new Date(
        Math.min(
          lastSeenAt.getTime() + 30 * 60 * 1_000,
          absoluteExpiresAt.getTime(),
        ),
      );

      await transaction.session.delete({ where: { id: current.id } });
      await transaction.session.create({
        data: {
          absoluteExpiresAt,
          createdAt,
          idleExpiresAt,
          lastSeenAt,
          tokenHash: current.tokenHash,
          userId: current.userId,
        },
      });
    });
  }

  async originalTokenMatchesPersistedValue(token: string): Promise<boolean> {
    const pattern = `%${token}%`;
    const rows = await this.client.$queryRaw<Array<{ found: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM "user_invitations" WHERE "token_hash"::text = ${token}
        UNION ALL
        SELECT 1 FROM "sessions" WHERE "token_hash"::text = ${token}
        UNION ALL
        SELECT 1
          FROM "audit_logs"
         WHERE COALESCE("before_data"::text, '') LIKE ${pattern}
            OR COALESCE("after_data"::text, '') LIKE ${pattern}
            OR COALESCE("metadata"::text, '') LIKE ${pattern}
      ) AS "found"
    `;
    return rows[0]?.found ?? false;
  }

  /**
   * Seed products dedicated to one sales test. Codes are suffixed so a test
   * that sells a product never collides with the next test, which matters
   * because sold products cannot be deleted.
   */
  async seedSalesFixtures(suffix: string): Promise<{
    multiWarehouseCode: string;
    nullCostCode: string;
  }> {
    const normalizedSuffix = suffix.toUpperCase();
    const multiWarehouseCode = `E2E-SALE-${normalizedSuffix}`;
    const nullCostCode = `E2E-SALE-NC-${normalizedSuffix}`;
    await this.client.$transaction(async (transaction) => {
      const unit = await transaction.unit.upsert({
        create: { code: 'E2E-UNIT', name: 'Unidad sintética' },
        update: {},
        where: { code: 'E2E-UNIT' },
      });
      const [sellable, nullCost] = await Promise.all([
        transaction.product.create({
          data: {
            code: multiWarehouseCode,
            name: `Producto vendible ${normalizedSuffix}`,
            unitId: unit.id,
          },
          select: { id: true },
        }),
        transaction.product.create({
          data: {
            code: nullCostCode,
            name: `Producto sin costo ${normalizedSuffix}`,
            unitId: unit.id,
          },
          select: { id: true },
        }),
      ]);
      const warehouses = await transaction.warehouse.findMany({
        orderBy: { code: 'asc' },
        select: { code: true, id: true },
      });
      const byCode = new Map(
        warehouses.map((warehouse) => [warehouse.code, warehouse]),
      );
      const dylan = byCode.get('CASA_DYLAN');
      const jean = byCode.get('CASA_JEAN');
      if (!dylan || !jean) {
        throw new Error('Synthetic sales fixture prerequisites are missing.');
      }
      await transaction.inventoryBalance.createMany({
        data: [
          {
            // Zero cost is valid and must remain zero (ADR-009).
            currentUnitCost: 0,
            currentUnitPrice: 10,
            productId: sellable.id,
            quantity: 8,
            warehouseId: dylan.id,
          },
          {
            currentUnitCost: 3,
            currentUnitPrice: 12,
            productId: sellable.id,
            quantity: 5,
            warehouseId: jean.id,
          },
          {
            // A null cost must reject the whole sale with HTTP 422.
            costReviewRequired: true,
            currentUnitCost: null,
            currentUnitPrice: 9,
            productId: nullCost.id,
            quantity: 4,
            warehouseId: dylan.id,
          },
        ],
      });
    });
    return { multiWarehouseCode, nullCostCode };
  }

  async salesCounts(): Promise<{
    cancellations: number;
    confirmations: number;
    items: number;
    saleCancellationMovements: number;
    saleMovements: number;
    sales: number;
  }> {
    const [
      sales,
      items,
      cancellations,
      confirmations,
      saleMovements,
      saleCancellationMovements,
    ] = await Promise.all([
      this.client.sale.count(),
      this.client.saleItem.count(),
      this.client.saleCancellation.count(),
      this.client.inTransitConfirmation.count(),
      this.client.inventoryMovement.count({ where: { type: 'SALE' } }),
      this.client.inventoryMovement.count({
        where: { type: 'SALE_CANCELLATION' },
      }),
    ]);
    return {
      cancellations,
      confirmations,
      items,
      saleCancellationMovements,
      saleMovements,
      sales,
    };
  }

  async balanceQuantity(
    productCode: string,
    warehouseCode: string,
  ): Promise<number> {
    const balance = await this.client.inventoryBalance.findFirstOrThrow({
      select: { quantity: true },
      where: {
        product: { code: productCode },
        warehouse: { code: warehouseCode },
      },
    });
    return Number(balance.quantity.toString());
  }

  async denySalesPermission(
    code: 'sales.cancel' | 'sales.create' | 'sales.read',
  ): Promise<void> {
    const [permission, user] = await Promise.all([
      this.client.permission.findUniqueOrThrow({ where: { code } }),
      this.client.user.findUniqueOrThrow({
        where: { loginIdentifier: 'dylan' },
      }),
    ]);
    await this.client.userPermission.create({
      data: { effect: 'DENY', permissionId: permission.id, userId: user.id },
    });
  }

  /**
   * Seed one income and one expense category dedicated to one finance test.
   * Codes are suffixed so a test that posts an entry against a category never
   * collides with the next test, which matters because a category already
   * referenced by an entry cannot be deleted.
   */
  async seedFinanceFixtures(suffix: string): Promise<{
    expenseCategoryId: string;
    incomeCategoryId: string;
  }> {
    const [expense, income] = await Promise.all([
      this.client.financialCategory.create({
        data: {
          code: `E2E-FIN-EXP-${suffix}`,
          entryType: 'EXPENSE',
          name: `Gasto sintético ${suffix}`,
        },
        select: { id: true },
      }),
      this.client.financialCategory.create({
        data: {
          code: `E2E-FIN-INC-${suffix}`,
          entryType: 'INCOME',
          name: `Ingreso sintético ${suffix}`,
        },
        select: { id: true },
      }),
    ]);
    return { expenseCategoryId: expense.id, incomeCategoryId: income.id };
  }

  async financeCounts(): Promise<{
    closings: number;
    entries: number;
    reopenings: number;
  }> {
    const [entries, closings, reopenings] = await Promise.all([
      this.client.financialEntry.count(),
      this.client.dailyClosing.count(),
      this.client.dailyClosingReopening.count(),
    ]);
    return { closings, entries, reopenings };
  }

  async denyFinancePermission(
    code:
      | 'closings.create'
      | 'closings.read'
      | 'closings.reopen'
      | 'finances.manual.create'
      | 'finances.read',
  ): Promise<void> {
    const [permission, user] = await Promise.all([
      this.client.permission.findUniqueOrThrow({ where: { code } }),
      this.client.user.findUniqueOrThrow({
        where: { loginIdentifier: 'dylan' },
      }),
    ]);
    await this.client.userPermission.create({
      data: { effect: 'DENY', permissionId: permission.id, userId: user.id },
    });
  }
}
