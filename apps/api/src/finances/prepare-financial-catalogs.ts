import type { DatabaseClient } from '@sgi/database';

import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';

// Vocabulary from legacy actualizarCategoriasFinanzas. This prepares a catalog,
// not financial entries, historical mappings, or automatically derived sales.
export const legacyFinancialCategories = [
  {
    code: 'INCOME_OPENING_CAPITAL',
    name: 'Capital Inicial / Apertura',
    entryType: 'INCOME',
  },
  { code: 'INCOME_LOAN', name: 'Prestamo Recibido', entryType: 'INCOME' },
  { code: 'INCOME_OTHER', name: 'Otros Ingresos', entryType: 'INCOME' },
  {
    code: 'EXPENSE_LOGISTICS_CUSTOMS',
    name: 'Logistica/Aduana',
    entryType: 'EXPENSE',
  },
  { code: 'EXPENSE_MARKETING', name: 'Marketing/Ads', entryType: 'EXPENSE' },
  { code: 'EXPENSE_PACKAGING', name: 'Empaques', entryType: 'EXPENSE' },
  {
    code: 'EXPENSE_DEBT_PAYMENT',
    name: 'Pago de Deuda/Prestamo',
    entryType: 'EXPENSE',
  },
  {
    code: 'EXPENSE_OPERATIONS',
    name: 'Operativos (Internet/Transporte)',
    entryType: 'EXPENSE',
  },
  {
    code: 'EXPENSE_PARTNER_WITHDRAWAL',
    name: 'Retiro Socio',
    entryType: 'EXPENSE',
  },
] as const;

export class FinancialCatalogError extends Error {
  constructor(
    readonly code:
      'FINANCIAL_CATALOG_PERMISSION_DENIED' | 'FINANCIAL_CATALOG_CONFLICT',
  ) {
    super(code);
    this.name = 'FinancialCatalogError';
  }
}

function normalizedName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toUpperCase();
}

/** Explicit operator command only; never called from a read, startup or migration. */
export async function prepareFinancialCatalogs(
  client: DatabaseClient,
  actorIdentifier: string,
  commit = false,
) {
  const permissions = new EffectivePermissionsService(client);
  return client.$transaction(
    async (transaction) => {
      const actor = await transaction.user.findUnique({
        where: { loginIdentifier: actorIdentifier },
        select: { id: true, status: true, activatedAt: true },
      });
      if (
        !actor ||
        actor.status !== 'ACTIVE' ||
        !actor.activatedAt ||
        !(await permissions.hasPermissionUsing(
          transaction,
          actor.id,
          'finances.manual.create',
        ))
      ) {
        throw new FinancialCatalogError('FINANCIAL_CATALOG_PERMISSION_DENIED');
      }
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('financial-catalogs-v1', 0))`;
      const existing = await transaction.financialCategory.findMany();
      const missing: (typeof legacyFinancialCategories)[number][] = [];
      for (const expected of legacyFinancialCategories) {
        const byCode = existing.find(
          (category) => category.code === expected.code,
        );
        // Never silently reinterpret an existing code or duplicate a category
        // whose legacy name was already prepared under a different code.
        const nameConflict = existing.some(
          (category) =>
            category.code !== expected.code &&
            category.entryType === expected.entryType &&
            normalizedName(category.name) === normalizedName(expected.name),
        );
        if (
          nameConflict ||
          (byCode &&
            (byCode.name !== expected.name ||
              byCode.entryType !== expected.entryType))
        ) {
          throw new FinancialCatalogError('FINANCIAL_CATALOG_CONFLICT');
        }
        if (!byCode) missing.push(expected);
      }
      if (commit) {
        for (const category of missing) {
          const created = await transaction.financialCategory.create({
            data: category,
          });
          await transaction.auditLog.create({
            data: {
              action: 'finances.category_prepared',
              actorUserId: actor.id,
              entityType: 'FinancialCategory',
              entityId: created.id,
              afterData: { ...category, active: created.active },
              metadata: {
                source: 'legacy.actualizarCategoriasFinanzas',
                catalogVersion: 1,
              },
            },
          });
        }
      }
      return {
        mode: commit ? 'commit' : 'dry-run',
        planned: missing.map((category) => category.code),
        created: commit ? missing.length : 0,
        unchanged: legacyFinancialCategories.length - missing.length,
        inactive: existing
          .filter(
            (category) =>
              !category.active &&
              legacyFinancialCategories.some(
                (expected) => expected.code === category.code,
              ),
          )
          .map((category) => category.code),
      };
    },
    { timeout: 30_000 },
  );
}
