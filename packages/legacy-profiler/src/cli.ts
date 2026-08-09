import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  SGI_EXPECTED_SHA256,
  SGI_SOURCE_CODE,
} from './config/sgi-legacy-inventory-profile.js';
import { buildProfileEvidence } from './index.js';
import { PROFILER_VERSION } from './profiling/workbook-profiler.js';
import {
  verifyManifestChecksums,
  writePrivateReports,
} from './reporting/private-report-writer.js';
import { readWorkbookFile } from './xlsx/sheetjs-workbook-reader.js';

interface CliArguments {
  input: string;
  sourceCode: string;
  output: string;
}

const FORBIDDEN_OPTIONS = new Set([
  '--commit',
  '--write-db',
  '--import',
  '--database-url',
  '--database_url',
]);

function parseArguments(rawArguments: string[]): CliArguments {
  const argumentsWithoutSeparator =
    rawArguments[0] === '--' ? rawArguments.slice(1) : rawArguments;
  const values = new Map<string, string>();
  for (let index = 0; index < argumentsWithoutSeparator.length; index += 1) {
    const option = argumentsWithoutSeparator[index];
    if (option === undefined) continue;
    if (FORBIDDEN_OPTIONS.has(option.toLocaleLowerCase('en-US'))) {
      throw new Error('CLI_FORBIDDEN_OPTION');
    }
    if (!['--input', '--source-code', '--output'].includes(option)) {
      throw new Error('CLI_UNKNOWN_OPTION');
    }
    const value = argumentsWithoutSeparator[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error('CLI_MISSING_OPTION_VALUE');
    }
    if (values.has(option)) throw new Error('CLI_DUPLICATE_OPTION');
    values.set(option, value);
    index += 1;
  }
  const input = values.get('--input');
  const sourceCode = values.get('--source-code');
  if (input === undefined || sourceCode === undefined) {
    throw new Error('CLI_REQUIRED_ARGUMENT_MISSING');
  }
  return {
    input,
    sourceCode,
    output: values.get('--output') ?? 'reports/private/profiling',
  };
}

function classifyFailure(error: unknown): 2 | 3 | 5 | 6 {
  const message = error instanceof Error ? error.message : 'UNKNOWN';
  if (
    message.startsWith('CLI_') ||
    message === 'WORKBOOK_INPUT_NOT_FILE' ||
    message.includes('ENOENT')
  ) {
    return 2;
  }
  if (
    message.startsWith('OOXML_') ||
    message.startsWith('WORKBOOK_') ||
    /zip|xlsx|unsupported/iu.test(message)
  ) {
    return 3;
  }
  if (message.startsWith('REPORT_') || /EACCES|EPERM|ENOSPC/u.test(message)) {
    return 5;
  }
  return 6;
}

export async function runCli(rawArguments: string[]): Promise<number> {
  const startedAt = new Date();
  try {
    const options = parseArguments(rawArguments);
    if (options.sourceCode !== SGI_SOURCE_CODE) {
      throw new Error('CLI_UNSUPPORTED_SOURCE_CODE');
    }
    await access(options.input);
    const { workbook } = await readWorkbookFile(
      options.input,
      options.sourceCode,
    );
    if (workbook.sourceSha256 !== SGI_EXPECTED_SHA256) {
      throw new Error('SOURCE_SHA256_INVARIANT_FAILED');
    }
    const evidence = buildProfileEvidence(workbook);
    const completedAt = new Date();
    const written = await writePrivateReports(options.output, evidence, {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      nodeVersion: process.version,
      profilerVersion: PROFILER_VERSION,
    });
    if (
      !(await verifyManifestChecksums(
        written.outputDirectory,
        written.manifest,
      ))
    ) {
      throw new Error('MANIFEST_CHECKSUM_INVARIANT_FAILED');
    }
    const blockers = evidence.findings.filter(
      (finding) => finding.blocksProfiling,
    ).length;
    process.stdout.write(
      [
        `PROFILE_SOURCE=${workbook.sourceCode}`,
        `PROFILE_SHA256=${workbook.sourceSha256}`,
        `PROFILE_SHEETS=${evidence.workbookProfile.sheetCount}`,
        `PROFILE_FINDINGS=${evidence.findings.length}`,
        `PROFILE_BLOCKERS=${blockers}`,
      ].join('\n') + '\n',
    );
    return blockers > 0 ? 4 : 0;
  } catch (error) {
    const exitCode = classifyFailure(error);
    const safeCode =
      error instanceof Error && /^[A-Z0-9_:.-]+$/u.test(error.message)
        ? error.message
        : 'PROFILER_FAILED';
    process.stderr.write(`LEGACY_PROFILER_ERROR=${safeCode}\n`);
    return exitCode;
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])
) {
  process.exitCode = await runCli(process.argv.slice(2));
}
