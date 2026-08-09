import { describe, expect, it } from 'vitest';

import { buildImportPlan } from '../src/planning/import-plan-builder.js';
import { reconcileImportPlan } from '../src/reconciliation/reconciliation-engine.js';
import {
  syntheticEvidence,
  syntheticMapping,
  syntheticWorkbook,
} from './fixtures/synthetic-import.js';

describe('raw-first import planning and reconciliation', () => {
  it('preserves every synthetic row and accounts for all Phase 3C gates', () => {
    const plan = buildImportPlan(
      syntheticWorkbook(),
      syntheticEvidence(),
      syntheticMapping(),
      'mapping-sha',
    );
    const reconciliation = reconcileImportPlan(plan);
    expect(plan.totalSourceRows).toBe(2);
    expect(plan.records).toHaveLength(2);
    expect(plan.records.map(({ status }) => status)).toEqual([
      'REQUIRES_HUMAN_APPROVAL',
      'REQUIRES_HUMAN_APPROVAL',
    ]);
    expect(plan.records[0]?.rawData.cells[0]?.value).toBe('Ficticia A');
    expect(reconciliation).toMatchObject({
      totalSourceRows: 2,
      rawPreservedRows: 2,
      droppedRows: 0,
      phase3cFindingsExpected: 24,
      phase3cFindingsAccounted: 24,
    });
    expect(
      reconciliation.issues.filter(
        ({ code }) => code === 'UNIT_MAPPING_UNRESOLVED',
      ),
    ).toHaveLength(2);
    expect(
      new Set(plan.phase3cFindings.map(({ ruleCode }) => ruleCode)),
    ).toEqual(
      new Set([
        'LEGACY_DGGR_X_DUPLICATE',
        'LEGACY_CCWH_L_DUPLICATE',
        'SALE_GROUPING_UNRESOLVED',
        'EXACT_DUPLICATE_ROW',
        'LEGACY_MOVEMENT_WITHOUT_SALE',
        'LEGACY_SALES_WITHOUT_MOVEMENT',
        'ORPHAN_RELATION',
      ]),
    );
  });
});
