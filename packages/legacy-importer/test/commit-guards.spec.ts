import { describe, expect, it } from 'vitest';

import {
  assertCommitEvidence,
  persistentImportLockKeys,
} from '../src/guards/commit-guard.js';
import {
  commitConfirmationPhrase,
  requireInteractiveCommitConfirmation,
} from '../src/guards/interactive-confirmation.js';
import { assertExpectedTargetFingerprint } from '../src/guards/target-fingerprint.js';
import { databaseFullCommitPlan } from './fixtures/synthetic-import.js';

describe('persistent commit guardrails', () => {
  it('accepts only the exact approved scope and evidence', () => {
    const prepared = {
      ...databaseFullCommitPlan('guard'),
      workbook: {} as never,
      verifiedEvidence: {} as never,
      mapping: {} as never,
      mappingSha256: 'f'.repeat(64),
    };
    expect(() =>
      assertCommitEvidence(prepared, {
        sourceSha256: prepared.plan.sourceSha256,
        manifestSha256: prepared.plan.manifestSha256,
        mappingSha256: prepared.plan.mappingSha256,
        approvedPlanKey: prepared.plan.approvedPlanKey,
        importerVersion: prepared.plan.importerVersion,
      }),
    ).not.toThrow();
    expect(() =>
      assertCommitEvidence(prepared, {
        sourceSha256: prepared.plan.sourceSha256,
        manifestSha256: prepared.plan.manifestSha256,
        mappingSha256: prepared.plan.mappingSha256,
        approvedPlanKey: '1'.repeat(64),
        importerVersion: prepared.plan.importerVersion,
      }),
    ).toThrow('COMMIT_APPROVED_PLAN_KEY_MISMATCH');

    const valid = {
      sourceSha256: prepared.plan.sourceSha256,
      manifestSha256: prepared.plan.manifestSha256,
      mappingSha256: prepared.plan.mappingSha256,
      approvedPlanKey: prepared.plan.approvedPlanKey,
      importerVersion: prepared.plan.importerVersion,
    };
    for (const [field, code] of [
      ['sourceSha256', 'COMMIT_SOURCE_SHA_MISMATCH'],
      ['manifestSha256', 'COMMIT_MANIFEST_SHA_MISMATCH'],
      ['mappingSha256', 'COMMIT_MAPPING_SHA_MISMATCH'],
      ['approvedPlanKey', 'COMMIT_APPROVED_PLAN_KEY_MISMATCH'],
    ] as const) {
      expect(() =>
        assertCommitEvidence(prepared, {
          ...valid,
          [field]: '9'.repeat(64),
        }),
      ).toThrow(code);
    }
    expect(() =>
      assertCommitEvidence(prepared, {
        ...valid,
        importerVersion: 'other',
      }),
    ).toThrow('COMMIT_IMPORTER_VERSION_MISMATCH');
  });

  it('derives deterministic global, source and plan locks in fixed order', () => {
    const first = persistentImportLockKeys('source', 'a'.repeat(64));
    const second = persistentImportLockKeys('source', 'a'.repeat(64));
    expect(first).toEqual(second);
    expect(new Set(first.map(String))).toHaveLength(3);
  });

  it('rejects a wrong positive database fingerprint', () => {
    expect(() =>
      assertExpectedTargetFingerprint(
        {
          targetEnvironment: 'test',
          databaseName: 'test',
          serverAddress: 'local',
          serverPort: 5432,
          serverVersion: '180004',
          migrationStateSha256: 'a'.repeat(64),
          warehouseIdentitySha256: 'b'.repeat(64),
          fingerprint: 'c'.repeat(64),
        },
        'd'.repeat(64),
      ),
    ).toThrow('TARGET_FINGERPRINT_MISMATCH');
  });

  it('requires real TTYs and the exact interactive phrase', async () => {
    const fingerprint = 'b'.repeat(64);
    const phrase = commitConfirmationPhrase(fingerprint);
    const writes: string[] = [];
    await expect(
      requireInteractiveCommitConfirmation(
        {
          inputIsTTY: true,
          outputIsTTY: true,
          write: (value) => writes.push(value),
          question: async () => phrase,
        },
        {
          targetFingerprint: fingerprint,
          sourceSha256: 'c'.repeat(64),
          approvedPlanKey: 'd'.repeat(64),
          operatorUserId: '11111111-1111-4111-8111-111111111111',
          backupSha256: 'e'.repeat(64),
          businessWrites: 872,
        },
      ),
    ).resolves.toBeUndefined();
    expect(writes.join('')).not.toContain('password');
    await expect(
      requireInteractiveCommitConfirmation(
        {
          inputIsTTY: false,
          outputIsTTY: true,
          write: () => undefined,
          question: async () => phrase,
        },
        {
          targetFingerprint: fingerprint,
          sourceSha256: 'c'.repeat(64),
          approvedPlanKey: 'd'.repeat(64),
          operatorUserId: '11111111-1111-4111-8111-111111111111',
          backupSha256: 'e'.repeat(64),
          businessWrites: 872,
        },
      ),
    ).rejects.toThrow('COMMIT_TTY_REQUIRED');
    await expect(
      requireInteractiveCommitConfirmation(
        {
          inputIsTTY: true,
          outputIsTTY: true,
          write: () => undefined,
          question: async () => `${phrase} `,
        },
        {
          targetFingerprint: fingerprint,
          sourceSha256: 'c'.repeat(64),
          approvedPlanKey: 'd'.repeat(64),
          operatorUserId: '11111111-1111-4111-8111-111111111111',
          backupSha256: 'e'.repeat(64),
          businessWrites: 872,
        },
      ),
    ).rejects.toThrow('COMMIT_CONFIRMATION_REJECTED');
  });
});
