import type { MappingRegistry, TransformPolicy } from './import-types.js';

export function transformationPolicy(
  mapping: MappingRegistry,
  ruleCode: string,
): TransformPolicy | null {
  for (const policy of ['APPLY', 'OBSERVE_ONLY', 'FORBIDDEN'] as const) {
    if (mapping.transformPolicies[policy].includes(ruleCode)) return policy;
  }
  return null;
}

export function assertTransformationAllowed(
  mapping: MappingRegistry,
  ruleCode: string,
): void {
  if (transformationPolicy(mapping, ruleCode) !== 'APPLY') {
    throw new Error(`TRANSFORMATION_NOT_APPROVED:${ruleCode}`);
  }
}
