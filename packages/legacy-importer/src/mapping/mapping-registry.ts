import { readFile } from 'node:fs/promises';

import { canonicalFingerprint } from '@sgi/legacy-profiler';

import { LegacyImporterError } from '../domain/errors.js';
import type {
  MappingRegistry,
  SheetImportScope,
  TransformPolicy,
} from '../domain/import-types.js';

const SCOPES = new Set<SheetImportScope>([
  'IMPORT_NOW',
  'PRESERVE_RAW_ONLY',
  'DEFER_TO_LATER_PHASE',
  'BLOCKED_PENDING_DECISION',
]);
const POLICIES: TransformPolicy[] = ['APPLY', 'OBSERVE_ONLY', 'FORBIDDEN'];

function assertMappingRegistry(
  value: unknown,
  sourceCode: string,
  sourceSha256: string,
): asserts value is MappingRegistry {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LegacyImporterError('MAPPING_REGISTRY_INVALID', 4);
  }
  const mapping = value as Partial<MappingRegistry>;
  if (
    mapping.schemaVersion !== 1 ||
    typeof mapping.mappingVersion !== 'string' ||
    mapping.sourceCode !== sourceCode ||
    mapping.sourceSha256 !== sourceSha256 ||
    mapping.defaultMappingStatus !== 'UNRESOLVED' ||
    !Array.isArray(mapping.sheets) ||
    mapping.transformPolicies === undefined ||
    mapping.approvedMappings === undefined
  ) {
    throw new LegacyImporterError('MAPPING_REGISTRY_IDENTITY_MISMATCH', 4);
  }
  if (
    mapping.sheets.some(
      (sheet) =>
        typeof sheet.name !== 'string' ||
        !SCOPES.has(sheet.scope) ||
        !Array.isArray(sheet.decisionCodes),
    )
  ) {
    throw new LegacyImporterError('MAPPING_REGISTRY_SHEET_INVALID', 4);
  }
  if (
    POLICIES.some(
      (policy) => !Array.isArray(mapping.transformPolicies?.[policy]),
    )
  ) {
    throw new LegacyImporterError('MAPPING_REGISTRY_POLICY_INVALID', 4);
  }
  if (
    !Array.isArray(mapping.approvedMappings.units) ||
    !Array.isArray(mapping.approvedMappings.warehouses) ||
    !Array.isArray(mapping.approvedMappings.businessEntityWrites)
  ) {
    throw new LegacyImporterError('MAPPING_REGISTRY_APPROVAL_INVALID', 4);
  }
  if (
    mapping.approvedDecisions !== undefined &&
    (!Array.isArray(mapping.approvedDecisions.productCanonicalization) ||
      !Array.isArray(
        mapping.approvedDecisions.inventorySnapshotSelection?.decisionCodes,
      ) ||
      !Array.isArray(mapping.approvedDecisions.resolvedPhase3cRuleCodes) ||
      !Array.isArray(mapping.approvedDecisions.deferredPhase3cRuleCodes))
  ) {
    throw new LegacyImporterError('MAPPING_REGISTRY_DECISIONS_INVALID', 4);
  }
}

export async function loadMappingRegistry(
  mappingPath: string,
  sourceCode: string,
  sourceSha256: string,
): Promise<{ mapping: MappingRegistry; mappingSha256: string }> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(mappingPath, 'utf8')) as unknown;
  } catch {
    throw new LegacyImporterError('MAPPING_REGISTRY_READ_FAILED', 4);
  }
  assertMappingRegistry(value, sourceCode, sourceSha256);
  return { mapping: value, mappingSha256: canonicalFingerprint(value) };
}

export function findSheetMapping(mapping: MappingRegistry, sheetName: string) {
  const rule = mapping.sheets.find(({ name }) => name === sheetName);
  if (rule === undefined) {
    throw new LegacyImporterError('SHEET_MAPPING_MISSING', 4);
  }
  return rule;
}
