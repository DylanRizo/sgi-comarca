import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sha256Bytes } from '@sgi/legacy-profiler';

import {
  importerExitCode,
  LegacyImporterError,
  safeErrorCode,
} from './domain/errors.js';
import { prepareImport } from './input/prepare-import.js';
import { executeDryRun } from './persistence/dry-run-repository.js';
import { createManagedTemporaryDatabase } from './persistence/temporary-database-manager.js';
import { writePrivateImportReports } from './reporting/private-import-report-writer.js';

const SOURCE_CODE = 'legacy-inventory-xlsx';
const SOURCE_SHA256 =
  'd0bb929d9498db888295d2c556a51e1a90f3d5834e9c4d544d9b1bb65d46e550';

interface CliArguments {
  inputPath: string;
  sourceCode: string;
  profileDirectory: string;
  mappingPath: string;
  reportDirectory: string;
}

const VALUE_OPTIONS = new Set([
  '--input',
  '--source-code',
  '--profile-dir',
  '--mapping-file',
  '--report-dir',
]);
const FORBIDDEN_OPTIONS = new Set([
  '--commit',
  '--write',
  '--write-db',
  '--apply',
  '--production',
  '--import',
  '--database-url',
  '--database_url',
]);

export function parseArguments(rawArguments: string[]): CliArguments {
  const arguments_ =
    rawArguments[0] === '--' ? rawArguments.slice(1) : rawArguments;
  const values = new Map<string, string>();
  let dryRun = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === undefined) continue;
    const normalized = argument.toLocaleLowerCase('en-US');
    if (FORBIDDEN_OPTIONS.has(normalized)) {
      throw new LegacyImporterError('CLI_PERSISTENT_WRITE_FORBIDDEN', 2);
    }
    if (argument === '--dry-run') {
      if (dryRun) throw new LegacyImporterError('CLI_DUPLICATE_OPTION', 2);
      dryRun = true;
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
  if (!dryRun) throw new LegacyImporterError('CLI_DRY_RUN_REQUIRED', 2);
  const inputPath = values.get('--input');
  const sourceCode = values.get('--source-code');
  const profileDirectory = values.get('--profile-dir');
  const mappingPath = values.get('--mapping-file');
  if (
    inputPath === undefined ||
    sourceCode === undefined ||
    profileDirectory === undefined ||
    mappingPath === undefined
  ) {
    throw new LegacyImporterError('CLI_REQUIRED_ARGUMENT_MISSING', 2);
  }
  return {
    inputPath,
    sourceCode,
    profileDirectory,
    mappingPath,
    reportDirectory: values.get('--report-dir') ?? 'reports/private/importing',
  };
}

function assertPrivateReportPath(
  repositoryRoot: string,
  reportDirectory: string,
): void {
  const approvedRoot = path.resolve(
    repositoryRoot,
    'reports/private/importing',
  );
  const actual = path.resolve(repositoryRoot, reportDirectory);
  const relative = path.relative(approvedRoot, actual);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new LegacyImporterError('PRIVATE_REPORT_PATH_REQUIRED', 2);
  }
}

export async function runCli(
  rawArguments: string[],
  repositoryRoot = process.cwd(),
): Promise<number> {
  let temporaryDatabase:
    Awaited<ReturnType<typeof createManagedTemporaryDatabase>> | undefined;
  try {
    const options = parseArguments(rawArguments);
    if (options.sourceCode !== SOURCE_CODE) {
      throw new LegacyImporterError('CLI_UNSUPPORTED_SOURCE_CODE', 2);
    }
    assertPrivateReportPath(repositoryRoot, options.reportDirectory);
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
    const sourceHashBefore = sha256Bytes(await readFile(inputPath));
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
    temporaryDatabase = await createManagedTemporaryDatabase(repositoryRoot);
    const execution = await executeDryRun(
      temporaryDatabase.client,
      temporaryDatabase.fingerprint,
      prepared.plan,
      prepared.reconciliation,
    );
    const reports = await writePrivateImportReports(
      path.resolve(repositoryRoot, options.reportDirectory),
      prepared.plan,
      prepared.reconciliation,
      execution,
    ).catch(() => {
      throw new LegacyImporterError('PRIVATE_REPORT_WRITE_FAILED', 5);
    });
    const sourceHashAfter = sha256Bytes(await readFile(inputPath));
    if (sourceHashAfter !== sourceHashBefore) {
      throw new LegacyImporterError('SOURCE_WORKBOOK_MUTATED', 6);
    }
    process.stdout.write(
      [
        `IMPORT_MODE=${execution.mode}`,
        `SOURCE_SHA256=${sourceHashAfter}`,
        `TOTAL_SOURCE_ROWS=${execution.totalSourceRows}`,
        `RAW_PRESERVED_ROWS=${execution.rawPreservedRows}`,
        `DROPPED_ROWS=${execution.droppedRows}`,
        `PHASE3C_FINDINGS_ACCOUNTED=${prepared.reconciliation.phase3cFindingsAccounted}`,
        `BUSINESS_ENTITY_WRITES=${execution.businessEntityWriteCount}`,
        `REPORT_BATCH=${path.basename(reports.outputDirectory)}`,
        'PERSISTENT_IMPORT_AUTHORIZED=false',
      ].join('\n') + '\n',
    );
    return 0;
  } catch (error) {
    process.stderr.write(`LEGACY_IMPORTER_ERROR=${safeErrorCode(error)}\n`);
    return importerExitCode(error);
  } finally {
    await temporaryDatabase?.dispose();
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])
) {
  process.exitCode = await runCli(process.argv.slice(2));
}
