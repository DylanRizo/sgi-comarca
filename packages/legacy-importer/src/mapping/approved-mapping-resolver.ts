import type {
  ApprovedMapping,
  MappingResolution,
} from '../domain/import-types.js';

export interface MappingResolutionResult {
  status: MappingResolution;
  targetCode: string | null;
  decisionCode: string | null;
}

export function resolveApprovedMapping(
  sourceValue: string,
  mappings: ApprovedMapping[],
): MappingResolutionResult {
  const approved = mappings.find(
    (mapping) => mapping.sourceValue === sourceValue,
  );
  if (approved === undefined) {
    return { status: 'UNRESOLVED', targetCode: null, decisionCode: null };
  }
  return {
    status: 'APPROVED',
    targetCode: approved.targetCode,
    decisionCode: approved.decisionCode,
  };
}
