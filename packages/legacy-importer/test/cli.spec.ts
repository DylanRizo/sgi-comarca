import { describe, expect, it } from 'vitest';

import { parseArguments } from '../src/cli.js';

const valid = [
  '--dry-run',
  '--input',
  'legacy/private/source.xlsx',
  '--source-code',
  'legacy-inventory-xlsx',
  '--profile-dir',
  'reports/private/profiling/source/hash',
  '--mapping-file',
  'packages/legacy-importer/config/mapping.json',
];

describe('legacy importer CLI boundary', () => {
  it('requires explicit dry-run and private defaults', () => {
    expect(parseArguments(valid)).toMatchObject({
      sourceCode: 'legacy-inventory-xlsx',
      reportDirectory: 'reports/private/importing',
    });
    expect(() =>
      parseArguments(valid.filter((item) => item !== '--dry-run')),
    ).toThrow('CLI_DRY_RUN_REQUIRED');
  });

  it.each(['--commit', '--write', '--apply', '--production', '--import'])(
    'rejects persistent option %s',
    (option) => {
      expect(() => parseArguments([...valid, option])).toThrow(
        'CLI_PERSISTENT_WRITE_FORBIDDEN',
      );
    },
  );
});
