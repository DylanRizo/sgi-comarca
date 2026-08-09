import { describe, expect, it } from 'vitest';

import { assertTransformationAllowed } from '../src/domain/transform-policy.js';
import { resolveApprovedMapping } from '../src/mapping/approved-mapping-resolver.js';
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
});
