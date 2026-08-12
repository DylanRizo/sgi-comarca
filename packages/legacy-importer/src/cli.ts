import { randomUUID } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createDatabaseClient, type DatabaseClient } from '@sgi/database';
import { sha256Bytes } from '@sgi/legacy-profiler';

import {
  importerExitCode,
  LegacyImporterError,
  safeErrorCode,
} from './domain/errors.js';
import {
  type ApprovedArtifactChecksums,
  verifyApprovedDryRunArtifacts,
} from './guards/approved-artifact-verifier.js';
import {
  readBackupEvidenceIdentity,
  verifyBackupRestoreEvidence,
} from './guards/backup-evidence.js';
import {
  readTargetSanityCounts,
  type CommitEvidenceExpectations,
} from './guards/commit-guard.js';
import {
  nodeInteractiveTerminal,
  requireInteractiveCommitConfirmation,
} from './guards/interactive-confirmation.js';
import {
  assertExpectedTargetFingerprint,
  readTargetDatabaseIdentity,
} from './guards/target-fingerprint.js';
import { prepareImport } from './input/prepare-import.js';
import { loadAndVerifyProfileEvidence } from './input/profile-evidence-loader.js';
import { loadMappingRegistry } from './mapping/mapping-registry.js';
import { executeDryRun } from './persistence/dry-run-repository.js';
import { executePersistentCommit } from './persistence/persistent-commit-engine.js';
import { createManagedTemporaryDatabase } from './persistence/temporary-database-manager.js';
import {
  writePrivateCommitFailureReport,
  writePrivateCommitReports,
} from './reporting/private-commit-report-writer.js';
import { writePrivateImportReports } from './reporting/private-import-report-writer.js';

const SOURCE_CODE = 'legacy-inventory-xlsx';
const SOURCE_SHA256 =
  'd0bb929d9498db888295d2c556a51e1a90f3d5834e9c4d544d9b1bb65d46e550';

interface CommonCliArguments {
  inputPath: string;
  sourceCode: string;
  profileDirectory: string;
  mappingPath: string;
  reportDirectory: string;
}

export interface DryRunCliArguments extends CommonCliArguments {
  mode: 'DRY_RUN';
}

export interface CommitCliArguments extends CommonCliArguments {
  mode: 'COMMIT';
  targetEnvironment: string;
  expectedTargetFingerprint: string;
  expectedDryRunBatchKey: string;
  expectedEvidence: CommitEvidenceExpectations;
  operatorUserId: string;
  backupPath: string;
  expectedBackupSha256: string;
  expectedRestoreEvidenceSha256: string;
  restoreEvidencePath: string;
  approvedReportDirectory: string;
  approvedArtifactChecksums: ApprovedArtifactChecksums;
  maintenanceWindowAcknowledged: true;
}

export type CliArguments = DryRunCliArguments | CommitCliArguments;

const COMMON_VALUE_OPTIONS = [
  '--input',
  '--source-code',
  '--profile-dir',
  '--mapping-file',
  '--report-dir',
] as const;
const COMMIT_VALUE_OPTIONS = [
  '--target-environment',
  '--expected-db-fingerprint',
  '--expected-source-sha',
  '--expected-manifest-sha',
  '--expected-mapping-sha',
  '--expected-approved-plan-key',
  '--expected-importer-version',
  '--expected-dry-run-batch-key',
  '--operator-user-id',
  '--backup-file',
  '--expected-backup-sha',
  '--expected-restore-evidence-sha',
  '--restore-evidence-file',
  '--approved-report-dir',
  '--expected-import-plan-sha',
  '--expected-dry-run-summary-sha',
  '--expected-reconciliation-sha',
  '--expected-row-results-sha',
  '--expected-commit-preview-sha',
] as const;
const VALUE_OPTIONS = new Set<string>([
  ...COMMON_VALUE_OPTIONS,
  ...COMMIT_VALUE_OPTIONS,
]);
const FORBIDDEN_OPTIONS = new Set([
  '--write',
  '--write-db',
  '--apply',
  '--production',
  '--import',
  '--database-url',
  '--database_url',
  '--force',
]);

function required(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined) {
    throw new LegacyImporterError('CLI_REQUIRED_ARGUMENT_MISSING', 2);
  }
  return value;
}

export function parseArguments(rawArguments: string[]): CliArguments {
  const arguments_ =
    rawArguments[0] === '--' ? rawArguments.slice(1) : rawArguments;
  const values = new Map<string, string>();
  let dryRun = false;
  let commit = false;
  let maintenanceWindowAcknowledged = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === undefined) continue;
    const normalized = argument.toLocaleLowerCase('en-US');
    if (FORBIDDEN_OPTIONS.has(normalized)) {
      throw new LegacyImporterError('CLI_PERSISTENT_WRITE_OPTION_FORBIDDEN', 2);
    }
    if (argument === '--dry-run' || argument === '--commit') {
      if (argument === '--dry-run') dryRun = true;
      if (argument === '--commit') commit = true;
      continue;
    }
    if (argument === '--ack-maintenance-window') {
      if (maintenanceWindowAcknowledged) {
        throw new LegacyImporterError('CLI_DUPLICATE_OPTION', 2);
      }
      maintenanceWindowAcknowledged = true;
      continue;
    }
    if (!VALUE_OPTIONS.has(argument)) {
      throw new LegacyImporterError('CLI_UNKNOWN_OPTION', 2);
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new LegacyImporterError('CLI_MISSING_OPTION_VALUE', 2);
    }
    if (values.has(argument)) {
      throw new LegacyImporterError('CLI_DUPLICATE_OPTION', 2);
    }
    values.set(argument, value);
    index += 1;
  }
  if (dryRun === commit) {
    throw new LegacyImporterError('CLI_EXECUTION_MODE_REQUIRED', 2);
  }
  const common: CommonCliArguments = {
    inputPath: required(values, '--input'),
    sourceCode: required(values, '--source-code'),
    profileDirectory: required(values, '--profile-dir'),
    mappingPath: required(values, '--mapping-file'),
    reportDirectory: values.get('--report-dir') ?? 'reports/private/importing',
  };
  if (dryRun) {
    if (
      maintenanceWindowAcknowledged ||
      COMMIT_VALUE_OPTIONS.some((name) => values.has(name))
    ) {
      throw new LegacyImporterError('CLI_COMMIT_OPTION_WITH_DRY_RUN', 2);
    }
    return { ...common, mode: 'DRY_RUN' };
  }
  if (!maintenanceWindowAcknowledged) {
    throw new LegacyImporterError('CLI_MAINTENANCE_WINDOW_ACK_REQUIRED', 2);
  }
  return {
    ...common,
    mode: 'COMMIT',
    targetEnvironment: required(values, '--target-environment'),
    expectedTargetFingerprint: required(values, '--expected-db-fingerprint'),
    expectedDryRunBatchKey: required(values, '--expected-dry-run-batch-key'),
    expectedEvidence: {
      sourceSha256: required(values, '--expected-source-sha'),
      manifestSha256: required(values, '--expected-manifest-sha'),
      mappingSha256: required(values, '--expected-mapping-sha'),
      approvedPlanKey: required(values, '--expected-approved-plan-key'),
      importerVersion: required(values, '--expected-importer-version'),
    },
    operatorUserId: required(values, '--operator-user-id'),
    backupPath: required(values, '--backup-file'),
    expectedBackupSha256: required(values, '--expected-backup-sha'),
    expectedRestoreEvidenceSha256: required(
      values,
      '--expected-restore-evidence-sha',
    ),
    restoreEvidencePath: required(values, '--restore-evidence-file'),
    approvedReportDirectory: required(values, '--approved-report-dir'),
    approvedArtifactChecksums: {
      'import-plan.json': required(values, '--expected-import-plan-sha'),
      'dry-run-summary.json': required(
        values,
        '--expected-dry-run-summary-sha',
      ),
      'reconciliation.json': required(values, '--expected-reconciliation-sha'),
      'row-results.json': required(values, '--expected-row-results-sha'),
      'commit-preview.md': required(values, '--expected-commit-preview-sha'),
    },
    maintenanceWindowAcknowledged: true,
  };
}

function assertWithinRoot(
  repositoryRoot: string,
  approvedRelativeRoot: string,
  selected: string,
  errorCode: string,
): string {
  const approvedRoot = path.resolve(repositoryRoot, approvedRelativeRoot);
  const actual = path.resolve(repositoryRoot, selected);
  const relative = path.relative(approvedRoot, actual);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new LegacyImporterError(errorCode, 2);
  }
  return actual;
}

async function sourceSha256(inputPath: string): Promise<string> {
  return sha256Bytes(await readFile(inputPath));
}

export async function runCli(
  rawArguments: string[],
  repositoryRoot = process.cwd(),
): Promise<number> {
  let temporaryDatabase:
    Awaited<ReturnType<typeof createManagedTemporaryDatabase>> | undefined;
  let persistentClient: DatabaseClient | undefined;
  let commitOptions: CommitCliArguments | undefined;
  let persistentCommitted = false;
  let validatedCommitReportDirectory: string | undefined;
  try {
    const options = parseArguments(rawArguments);
    if (options.mode === 'COMMIT') commitOptions = options;
    if (options.sourceCode !== SOURCE_CODE) {
      throw new LegacyImporterError('CLI_UNSUPPORTED_SOURCE_CODE', 2);
    }
    const reportDirectory = assertWithinRoot(
      repositoryRoot,
      'reports/private/importing',
      options.reportDirectory,
      'PRIVATE_REPORT_PATH_REQUIRED',
    );
    if (options.mode === 'COMMIT') {
      validatedCommitReportDirectory = reportDirectory;
    }
    const inputPath = path.resolve(repositoryRoot, options.inputPath);
    const profileDirectory = path.resolve(
      repositoryRoot,
      options.profileDirectory,
    );
    const mappingPath = path.resolve(repositoryRoot, options.mappingPath);
    await Promise.all([
      access(inputPath),
      access(profileDirectory),
      access(mappingPath),
    ]);
    const sourceHashBefore = await sourceSha256(inputPath);
    if (sourceHashBefore !== SOURCE_SHA256) {
      throw new LegacyImporterError('SOURCE_SHA256_MISMATCH', 3);
    }
    const prepared = await prepareImport({
      inputPath,
      sourceCode: options.sourceCode,
      expectedSourceSha256: SOURCE_SHA256,
      profileDirectory,
      mappingPath,
    });
    if (options.mode === 'DRY_RUN') {
      temporaryDatabase = await createManagedTemporaryDatabase(repositoryRoot);
      const execution = await executeDryRun(
        temporaryDatabase.client,
        temporaryDatabase.fingerprint,
        prepared.plan,
        prepared.reconciliation,
      );
      const reports = await writePrivateImportReports(
        reportDirectory,
        prepared.plan,
        prepared.reconciliation,
        execution,
      ).catch(() => {
        throw new LegacyImporterError('PRIVATE_REPORT_WRITE_FAILED', 5);
      });
      const sourceHashAfter = await sourceSha256(inputPath);
      if (sourceHashAfter !== sourceHashBefore) {
        throw new LegacyImporterError('SOURCE_WORKBOOK_MUTATED', 6);
      }
      process.stdout.write(
        [
          `IMPORT_MODE=${execution.mode}`,
          `SOURCE_SHA256=${sourceHashAfter}`,
          `APPROVED_PLAN_KEY=${prepared.plan.approvedPlanKey}`,
          `TOTAL_SOURCE_ROWS=${execution.totalSourceRows}`,
          `RAW_PRESERVED_ROWS=${execution.rawPreservedRows}`,
          `DROPPED_ROWS=${execution.droppedRows}`,
          `PHASE3C_FINDINGS_ACCOUNTED=${prepared.reconciliation.phase3cFindingsAccounted}`,
          `BUSINESS_ENTITY_WRITES=${execution.businessEntityWriteCount}`,
          `UNITS_SIMULATED=${execution.businessEntityCounts.units}`,
          `PRODUCTS_SIMULATED=${execution.businessEntityCounts.products}`,
          `INVENTORY_BALANCES_SIMULATED=${execution.businessEntityCounts.inventoryBalances}`,
          `VALUATIONS_SIMULATED=${execution.businessEntityCounts.productWarehouseValuations}`,
          `VALUATION_OBSERVED_AT_MISSING=${execution.reconciliationIssueCountsByCode.VALUATION_OBSERVED_AT_MISSING ?? 0}`,
          `REPORT_BATCH=${path.basename(reports.outputDirectory)}`,
          'PERSISTENT_IMPORT_AUTHORIZED=false',
        ].join('\n') + '\n',
      );
      return 0;
    }

    if (
      options.expectedEvidence.sourceSha256 !== SOURCE_SHA256 ||
      prepared.plan.batchKey !== options.expectedDryRunBatchKey
    ) {
      throw new LegacyImporterError('COMMIT_APPROVED_IDENTITY_MISMATCH', 4);
    }
    const approvedReportDirectory = assertWithinRoot(
      repositoryRoot,
      'reports/private/importing',
      options.approvedReportDirectory,
      'APPROVED_REPORT_PATH_REQUIRED',
    );
    const backupPath = assertWithinRoot(
      repositoryRoot,
      'backups',
      options.backupPath,
      'PRIVATE_BACKUP_PATH_REQUIRED',
    );
    const restoreEvidencePath = assertWithinRoot(
      repositoryRoot,
      'backups',
      options.restoreEvidencePath,
      'PRIVATE_RESTORE_EVIDENCE_PATH_REQUIRED',
    );
    const verifyArtifacts = () =>
      verifyApprovedDryRunArtifacts(
        approvedReportDirectory,
        options.approvedArtifactChecksums,
      );
    const approvedArtifacts = await verifyArtifacts();
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl === undefined || databaseUrl === '') {
      throw new LegacyImporterError('DATABASE_URL_REQUIRED', 2);
    }
    persistentClient = createDatabaseClient(databaseUrl);
    const targetIdentity = await readTargetDatabaseIdentity(
      persistentClient,
      options.targetEnvironment,
    );
    assertExpectedTargetFingerprint(
      targetIdentity,
      options.expectedTargetFingerprint,
    );
    const sanityCounts = await readTargetSanityCounts(persistentClient);
    const verifyBackup = () =>
      verifyBackupRestoreEvidence({
        backupPath,
        expectedBackupSha256: options.expectedBackupSha256,
        restoreEvidencePath,
        expectedRestoreEvidenceSha256: options.expectedRestoreEvidenceSha256,
        expectedTargetFingerprint: options.expectedTargetFingerprint,
        expectedMigrationStateSha256: targetIdentity.migrationStateSha256,
        expectedSanityCounts: { ...sanityCounts },
      });
    const backup = await verifyBackup();
    await requireInteractiveCommitConfirmation(nodeInteractiveTerminal(), {
      targetFingerprint: options.expectedTargetFingerprint,
      sourceSha256: prepared.plan.sourceSha256,
      approvedPlanKey: prepared.plan.approvedPlanKey,
      operatorUserId: options.operatorUserId,
      backupSha256: backup.backupSha256,
      businessWrites: 872,
    });
    const startedAt = new Date().toISOString();
    const result = await executePersistentCommit(persistentClient, {
      prepared,
      expectedEvidence: options.expectedEvidence,
      approvedArtifactChecksums: approvedArtifacts,
      targetEnvironment: options.targetEnvironment,
      expectedTargetFingerprint: options.expectedTargetFingerprint,
      operatorUserId: options.operatorUserId,
      backup,
      maintenanceWindowAcknowledged: true,
      revalidateEvidence: async () =>
        prepareImport({
          inputPath,
          sourceCode: options.sourceCode,
          expectedSourceSha256: options.expectedEvidence.sourceSha256,
          profileDirectory,
          mappingPath,
        }),
      revalidateCriticalEvidence: async () => {
        const [sourceSha256Value, evidence, mapping] = await Promise.all([
          sourceSha256(inputPath),
          loadAndVerifyProfileEvidence(
            profileDirectory,
            options.sourceCode,
            options.expectedEvidence.sourceSha256,
          ),
          loadMappingRegistry(
            mappingPath,
            options.sourceCode,
            options.expectedEvidence.sourceSha256,
          ),
        ]);
        return {
          sourceSha256: sourceSha256Value,
          manifestSha256: evidence.manifestSha256,
          mappingSha256: mapping.mappingSha256,
          importerVersion: prepared.plan.importerVersion,
        };
      },
      revalidateApprovedArtifacts: verifyArtifacts,
      revalidateBackup: verifyBackup,
      revalidateBackupIdentity: () =>
        readBackupEvidenceIdentity(backupPath, restoreEvidencePath),
      sourceSha256BeforeFinalCommit: () => sourceSha256(inputPath),
    });
    persistentCommitted = true;
    const completedAt = new Date().toISOString();
    await writePrivateCommitReports({
      outputRoot: reportDirectory,
      prepared,
      summary: result,
      backup,
      startedAt,
      completedAt,
    }).catch(() => {
      throw new LegacyImporterError(
        'PRIVATE_COMMIT_REPORT_WRITE_FAILED_AFTER_COMMIT',
        5,
      );
    });
    process.stdout.write(
      [
        'IMPORT_MODE=COMMIT',
        `EXECUTION_ID=${result.executionId}`,
        `IMPORT_BATCH_ID=${result.importBatchId}`,
        `BUSINESS_ENTITY_WRITES=${result.businessEntityWriteCount}`,
        `RAW_PRESERVED_ROWS=${result.rawPreservedRows}`,
        `RECONCILIATION_ISSUES=${result.reconciliationIssueCount}`,
      ].join('\n') + '\n',
    );
    return 0;
  } catch (error) {
    const code = safeErrorCode(error);
    if (
      commitOptions !== undefined &&
      validatedCommitReportDirectory !== undefined &&
      !persistentCommitted
    ) {
      await writePrivateCommitFailureReport({
        outputRoot: validatedCommitReportDirectory,
        failureId: randomUUID(),
        errorCode: code,
        occurredAt: new Date().toISOString(),
      }).catch(() => undefined);
    }
    process.stderr.write(`LEGACY_IMPORTER_ERROR=${code}\n`);
    return importerExitCode(error);
  } finally {
    await persistentClient?.$disconnect();
    await temporaryDatabase?.dispose();
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])
) {
  process.exitCode = await runCli(process.argv.slice(2));
}
