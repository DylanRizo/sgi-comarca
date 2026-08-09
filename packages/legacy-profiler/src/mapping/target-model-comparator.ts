import { SGI_TARGET_MAPPINGS } from '../config/sgi-legacy-inventory-profile.js';
import type { TargetMapping } from '../domain/profile-types.js';

export function compareTargetModels(): TargetMapping[] {
  return SGI_TARGET_MAPPINGS.map((mapping) => ({
    ...mapping,
    sourceSheets: [...mapping.sourceSheets].sort((left, right) =>
      left.localeCompare(right, 'en'),
    ),
  })).sort((left, right) =>
    left.targetModel.localeCompare(right.targetModel, 'en'),
  );
}
