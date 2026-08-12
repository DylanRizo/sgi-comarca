import { describe, expect, it } from 'vitest';

import { parseArguments } from '../src/cli.js';

const common = [
  '--input',
  'legacy/private/source.xlsx',
  '--source-code',
  'legacy-inventory-xlsx',
  '--profile-dir',
  'reports/private/profiling/source/hash',
  '--mapping-file',
  'packages/legacy-importer/config/mapping.json',
];
const sha = 'a'.repeat(64);
const commit = [
  '--commit',
  ...common,
  '--target-environment',
  'production',
  '--expected-db-fingerprint',
  sha,
  '--expected-source-sha',
  sha,
  '--expected-manifest-sha',
  sha,
  '--expected-mapping-sha',
  sha,
  '--expected-approved-plan-key',
  sha,
  '--expected-importer-version',
  '1.0.0',
  '--expected-dry-run-batch-key',
  sha,
  '--operator-user-id',
  '11111111-1111-4111-8111-111111111111',
  '--backup-file',
  'backups/phase4.dump',
  '--expected-backup-sha',
  sha,
  '--expected-restore-evidence-sha',
  sha,
  '--restore-evidence-file',
  'backups/phase4.restore.json',
  '--approved-report-dir',
  'reports/private/importing/source/hash/batch',
  '--expected-import-plan-sha',
  sha,
  '--expected-dry-run-summary-sha',
  sha,
  '--expected-reconciliation-sha',
  sha,
  '--expected-row-results-sha',
  sha,
  '--expected-commit-preview-sha',
  sha,
  '--ack-maintenance-window',
];

describe('legacy importer CLI boundary', () => {
  it('preserves explicit dry-run and its private default', () => {
    expect(parseArguments(['--dry-run', ...common])).toMatchObject({
      mode: 'DRY_RUN',
      sourceCode: 'legacy-inventory-xlsx',
      reportDirectory: 'reports/private/importing',
    });
    expect(() => parseArguments(common)).toThrow('CLI_EXECUTION_MODE_REQUIRED');
  });

  it('parses commit only when every non-secret guard argument is explicit', () => {
    expect(parseArguments(commit)).toMatchObject({
      mode: 'COMMIT',
      targetEnvironment: 'production',
      maintenanceWindowAcknowledged: true,
      expectedEvidence: { importerVersion: '1.0.0' },
    });
    expect(() => parseArguments(['--commit', ...common])).toThrow(
      'CLI_MAINTENANCE_WINDOW_ACK_REQUIRED',
    );
  });

  it('rejects mixing dry-run and commit', () => {
    expect(() => parseArguments(['--dry-run', ...commit])).toThrow(
      'CLI_EXECUTION_MODE_REQUIRED',
    );
  });

  it.each(['--write', '--apply', '--production', '--import', '--force'])(
    'rejects unsafe write alias %s',
    (option) => {
      expect(() => parseArguments(['--dry-run', ...common, option])).toThrow(
        'CLI_PERSISTENT_WRITE_OPTION_FORBIDDEN',
      );
    },
  );

  it('does not accept the confirmation phrase through arguments', () => {
    expect(() =>
      parseArguments([...commit, '--confirmation', 'anything']),
    ).toThrow('CLI_UNKNOWN_OPTION');
  });
});
