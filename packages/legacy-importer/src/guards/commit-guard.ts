import type { DatabaseClient } from '@sgi/database';
import { canonicalFingerprint } from '@sgi/legacy-profiler';

import { LegacyImporterError } from '../domain/errors.js';
import { advisoryLockKey } from '../domain/identity.js';
import type {
  ImportPlan,
  PreparedImport,
  ReconciliationResult,
} from '../domain/import-types.js';

const SHA256 = /^[a-f0-9]{64}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUIRED_WAREHOUSES = ['CASA_DYLAN', 'CASA_JEAN', 'CASA_LUDEN'];
const GLOBAL_LOCK_IDENTITY = canonicalFingerprint({
  scope: 'sgi-legacy-import-global',
  version: 1,
});

export interface CommitEvidenceExpectations {
  sourceSha256: string;
  manifestSha256: string;
  mappingSha256: string;
  approvedPlanKey: string;
  importerVersion: string;
}

export interface TargetSanityCounts {
  permissions: number;
  activeUserRoles: number;
  activeRolePermissions: number;
  activeUserPermissions: number;
  warehouses: number;
  units: number;
  products: number;
  inventoryBalances: number;
  productWarehouseValuations: number;
  legacySources: number;
  importBatches: number;
  legacyRecords: number;
  reconciliationIssues: number;
}

type GuardClient = Pick<
  DatabaseClient,
  | '$queryRawUnsafe'
  | 'permission'
  | 'userRole'
  | 'rolePermission'
  | 'userPermission'
  | 'warehouse'
  | 'unit'
  | 'product'
  | 'inventoryBalance'
  | 'productWarehouseValuation'
  | 'legacySource'
  | 'importBatch'
  | 'legacyRecord'
  | 'reconciliationIssue'
>;

function assertSha(value: string, code: string): void {
  if (!SHA256.test(value)) throw new LegacyImporterError(code, 2);
}

export function assertCommitEvidence(
  prepared: PreparedImport,
  expected: CommitEvidenceExpectations,
): void {
  for (const [value, code] of [
    [expected.sourceSha256, 'EXPECTED_SOURCE_SHA_INVALID'],
    [expected.manifestSha256, 'EXPECTED_MANIFEST_SHA_INVALID'],
    [expected.mappingSha256, 'EXPECTED_MAPPING_SHA_INVALID'],
    [expected.approvedPlanKey, 'EXPECTED_APPROVED_PLAN_KEY_INVALID'],
  ] as const) {
    assertSha(value, code);
  }
  const { plan, reconciliation } = prepared;
  if (plan.sourceSha256 !== expected.sourceSha256) {
    throw new LegacyImporterError('COMMIT_SOURCE_SHA_MISMATCH', 4);
  }
  if (plan.manifestSha256 !== expected.manifestSha256) {
    throw new LegacyImporterError('COMMIT_MANIFEST_SHA_MISMATCH', 4);
  }
  if (plan.mappingSha256 !== expected.mappingSha256) {
    throw new LegacyImporterError('COMMIT_MAPPING_SHA_MISMATCH', 4);
  }
  if (plan.approvedPlanKey !== expected.approvedPlanKey) {
    throw new LegacyImporterError('COMMIT_APPROVED_PLAN_KEY_MISMATCH', 4);
  }
  if (plan.importerVersion !== expected.importerVersion) {
    throw new LegacyImporterError('COMMIT_IMPORTER_VERSION_MISMATCH', 4);
  }
  assertExactPersistentScope(plan, reconciliation);
}

export function assertExactPersistentScope(
  plan: ImportPlan,
  reconciliation: ReconciliationResult,
): void {
  const business = plan.businessPlan;
  if (
    plan.totalSourceRows !== 2_064 ||
    reconciliation.rawPreservedRows !== 2_064 ||
    reconciliation.droppedRows !== 0 ||
    business === undefined ||
    business.units.length !== 14 ||
    business.products.length !== 144 ||
    business.inventoryBalances.length !== 357 ||
    business.productWarehouseValuations.length !== 357 ||
    reconciliation.issues.length !== 189
  ) {
    throw new LegacyImporterError('COMMIT_SCOPE_INVARIANT_FAILED', 4);
  }
  const statuses = countBy(reconciliation.issues, ({ status }) => status);
  const severities = countBy(reconciliation.issues, ({ severity }) => severity);
  if (
    statuses.RESOLVED !== 13 ||
    statuses.OPEN !== 173 ||
    statuses.REQUIRES_HUMAN_APPROVAL !== 3 ||
    severities.ERROR !== 5 ||
    severities.WARNING !== 179 ||
    severities.INFO !== 5 ||
    (severities.CRITICAL ?? 0) !== 0 ||
    reconciliation.issues.filter(
      ({ code }) => code === 'VALUATION_OBSERVED_AT_MISSING',
    ).length !== 2
  ) {
    throw new LegacyImporterError('COMMIT_RECONCILIATION_INVARIANT_FAILED', 4);
  }
}

function countBy<T>(
  values: T[],
  key: (value: T) => string,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) {
    const selected = key(value);
    result[selected] = (result[selected] ?? 0) + 1;
  }
  return result;
}

export async function readTargetSanityCounts(
  client: GuardClient,
): Promise<TargetSanityCounts> {
  const [
    permissions,
    activeUserRoles,
    activeRolePermissions,
    activeUserPermissions,
    warehouses,
    units,
    products,
    inventoryBalances,
    productWarehouseValuations,
    legacySources,
    importBatches,
    legacyRecords,
    reconciliationIssues,
  ] = await Promise.all([
    client.permission.count(),
    client.userRole.count({ where: { revokedAt: null } }),
    client.rolePermission.count({ where: { revokedAt: null } }),
    client.userPermission.count({ where: { revokedAt: null } }),
    client.warehouse.count(),
    client.unit.count(),
    client.product.count(),
    client.inventoryBalance.count(),
    client.productWarehouseValuation.count(),
    client.legacySource.count(),
    client.importBatch.count(),
    client.legacyRecord.count(),
    client.reconciliationIssue.count(),
  ]);
  return {
    permissions,
    activeUserRoles,
    activeRolePermissions,
    activeUserPermissions,
    warehouses,
    units,
    products,
    inventoryBalances,
    productWarehouseValuations,
    legacySources,
    importBatches,
    legacyRecords,
    reconciliationIssues,
  };
}

export async function assertEmptyFirstImportTarget(
  client: GuardClient,
): Promise<TargetSanityCounts> {
  const counts = await readTargetSanityCounts(client);
  if (
    counts.units !== 0 ||
    counts.products !== 0 ||
    counts.inventoryBalances !== 0 ||
    counts.productWarehouseValuations !== 0 ||
    counts.legacySources !== 0 ||
    counts.importBatches !== 0 ||
    counts.legacyRecords !== 0 ||
    counts.reconciliationIssues !== 0
  ) {
    throw new LegacyImporterError('COMMIT_TARGET_NOT_EMPTY', 4);
  }
  const warehouses = await client.warehouse.findMany({
    orderBy: { code: 'asc' },
    select: { code: true, active: true },
  });
  if (
    warehouses.length !== REQUIRED_WAREHOUSES.length ||
    warehouses.some(
      ({ code, active }, index) =>
        !active || code !== REQUIRED_WAREHOUSES[index],
    )
  ) {
    throw new LegacyImporterError('COMMIT_WAREHOUSE_MATRIX_INVALID', 4);
  }
  return counts;
}

export async function assertActiveAdminOperator(
  client: Pick<DatabaseClient, '$queryRawUnsafe'>,
  operatorUserId: string,
): Promise<void> {
  if (!UUID.test(operatorUserId)) {
    throw new LegacyImporterError('COMMIT_OPERATOR_ID_INVALID', 2);
  }
  const rows = await client.$queryRawUnsafe<
    Array<{ status: string; active_admin: boolean }>
  >(
    `SELECT u.status::text AS status,
            EXISTS (
              SELECT 1
                FROM user_roles ur
                JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = u.id
                 AND ur.revoked_at IS NULL
                 AND r.code = 'ADMIN'
            ) AS active_admin
       FROM users u
      WHERE u.id = $1::uuid`,
    operatorUserId,
  );
  const operator = rows[0];
  if (operator === undefined) {
    throw new LegacyImporterError('COMMIT_OPERATOR_NOT_FOUND', 4);
  }
  if (operator.status !== 'ACTIVE') {
    throw new LegacyImporterError('COMMIT_OPERATOR_NOT_ACTIVE', 4);
  }
  if (!operator.active_admin) {
    throw new LegacyImporterError('COMMIT_OPERATOR_ADMIN_REQUIRED', 4);
  }
}

export function persistentImportLockKeys(
  sourceCode: string,
  approvedPlanKey: string,
): [bigint, bigint, bigint] {
  return [
    advisoryLockKey(GLOBAL_LOCK_IDENTITY),
    advisoryLockKey(canonicalFingerprint({ scope: 'source', sourceCode })),
    advisoryLockKey(
      canonicalFingerprint({ scope: 'approved-plan', approvedPlanKey }),
    ),
  ];
}

export async function acquirePersistentImportLocks(
  client: Pick<DatabaseClient, '$queryRawUnsafe'>,
  sourceCode: string,
  approvedPlanKey: string,
): Promise<void> {
  for (const key of persistentImportLockKeys(sourceCode, approvedPlanKey)) {
    const rows = await client.$queryRawUnsafe<Array<{ acquired: boolean }>>(
      'SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',
      key.toString(),
    );
    if (rows[0]?.acquired !== true) {
      throw new LegacyImporterError('COMMIT_CONCURRENT_EXECUTION', 4);
    }
  }
}

export async function lockPersistentImportTables(
  client: Pick<DatabaseClient, '$executeRawUnsafe'>,
): Promise<void> {
  await client.$executeRawUnsafe(
    `LOCK TABLE
       units, products, inventory_balances, product_warehouse_valuations,
       legacy_sources, import_batches, legacy_records, reconciliation_issues
     IN SHARE ROW EXCLUSIVE MODE`,
  );
  await client.$executeRawUnsafe(
    'LOCK TABLE warehouses, users, roles, user_roles IN SHARE MODE',
  );
}
