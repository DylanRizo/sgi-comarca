import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { assertTransformationAllowed } from '../src/domain/transform-policy.js';
import { resolveApprovedMapping } from '../src/mapping/approved-mapping-resolver.js';
import { loadMappingRegistry } from '../src/mapping/mapping-registry.js';
import { syntheticMapping } from './fixtures/synthetic-import.js';

describe('versioned mapping registry', () => {
  it('uses exact approved Unit mappings and leaves all other values unresolved', () => {
    const mappings = syntheticMapping().approvedMappings.units;
    expect(resolveApprovedMapping('Ficticia A', mappings)).toEqual({
      status: 'APPROVED',
      targetCode: 'UNIT_A',
      decisionCode: 'TEST-APPROVED',
    });
    expect(resolveApprovedMapping(' ficticia a ', mappings)).toEqual({
      status: 'UNRESOLVED',
      targetCode: null,
      decisionCode: null,
    });
    expect(resolveApprovedMapping('Ficticia B', mappings).status).toBe(
      'UNRESOLVED',
    );
  });

  it('never promotes observe-only or forbidden transforms implicitly', () => {
    const mapping = syntheticMapping();
    expect(() => assertTransformationAllowed(mapping, 'TRIM')).toThrow(
      'TRANSFORMATION_NOT_APPROVED:TRIM',
    );
    expect(() =>
      assertTransformationAllowed(mapping, 'AUTOMATIC_DEDUPE'),
    ).toThrow('TRANSFORMATION_NOT_APPROVED:AUTOMATIC_DEDUPE');
    expect(() =>
      assertTransformationAllowed(mapping, 'UNAMBIGUOUS_DECIMAL'),
    ).not.toThrow();
  });

  it('loads the exact owner-approved Wave 1-2 mapping matrix', async () => {
    const { mapping } = await loadMappingRegistry(
      fileURLToPath(
        new URL(
          '../config/legacy-inventory-xlsx.mapping.json',
          import.meta.url,
        ),
      ),
      'legacy-inventory-xlsx',
      'd0bb929d9498db888295d2c556a51e1a90f3d5834e9c4d544d9b1bb65d46e550',
    );
    expect(mapping.mappingVersion).toBe('phase-4b.1');
    expect(mapping.approvedMappings.units).toHaveLength(15);
    expect(
      new Set(
        mapping.approvedMappings.units.map(({ targetCode }) => targetCode),
      ).size,
    ).toBe(14);
    expect(
      resolveApprovedMapping('Unidad', mapping.approvedMappings.units),
    ).toMatchObject({ status: 'APPROVED', targetCode: 'UNIDADES' });
    expect(mapping.approvedMappings.warehouses).toEqual([
      expect.objectContaining({
        sourceValue: 'Casa Dylan',
        targetCode: 'CASA_DYLAN',
      }),
      expect.objectContaining({
        sourceValue: 'Casa Luden',
        targetCode: 'CASA_LUDEN',
      }),
      expect.objectContaining({
        sourceValue: 'Casa Jean',
        targetCode: 'CASA_JEAN',
      }),
    ]);
    expect(mapping.approvedDecisions).toMatchObject({
      productCanonicalization: [
        {
          sourceCode: 'DGGR-X',
          canonicalRow: 29,
          evidenceOnlyRows: [30],
        },
      ],
      missingValuationObservedAtPolicy: {
        sourceSheet: 'Inventario',
        physicalRows: [153, 154],
        action: 'PRESERVE_RAW_AND_BALANCE_WITHOUT_VALUATION',
        issueCode: 'VALUATION_OBSERVED_AT_MISSING',
      },
    });
  });
});
