import { describe, expect, it } from 'vitest';

import { approvedPlanKey } from '../src/domain/approved-plan-identity.js';
import { databaseWave12Plan } from './fixtures/synthetic-import.js';

describe('approved plan identity', () => {
  it('is independent from dry-run or commit execution identity', () => {
    const { plan } = databaseWave12Plan('approval');
    const input = {
      sourceCode: plan.sourceCode,
      sourceSha256: plan.sourceSha256,
      manifestSha256: plan.manifestSha256,
      mappingSha256: plan.mappingSha256,
      mappingVersion: plan.mappingVersion,
      importerVersion: plan.importerVersion,
      businessPlan: plan.businessPlan,
    };
    const dryRunIdentity = {
      approvedPlanKey: approvedPlanKey(input),
      mode: 'DRY_RUN',
    };
    const commitIdentity = {
      approvedPlanKey: approvedPlanKey(input),
      mode: 'COMMIT',
    };
    expect(dryRunIdentity.approvedPlanKey).toBe(commitIdentity.approvedPlanKey);
    expect(dryRunIdentity.mode).not.toBe(commitIdentity.mode);
  });

  it('changes when canonical business values change', () => {
    const { plan } = databaseWave12Plan('approval-change');
    const original = plan.approvedPlanKey;
    plan.businessPlan!.inventoryBalances[0]!.quantity = '3';
    expect(
      approvedPlanKey({
        sourceCode: plan.sourceCode,
        sourceSha256: plan.sourceSha256,
        manifestSha256: plan.manifestSha256,
        mappingSha256: plan.mappingSha256,
        mappingVersion: plan.mappingVersion,
        importerVersion: plan.importerVersion,
        businessPlan: plan.businessPlan,
      }),
    ).not.toBe(original);
  });
});
