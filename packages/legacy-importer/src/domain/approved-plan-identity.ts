import { canonicalFingerprint } from '@sgi/legacy-profiler';

import type { Wave12BusinessPlan } from './import-types.js';

function canonicalBusinessPlan(plan: Wave12BusinessPlan | undefined) {
  if (plan === undefined) {
    return {
      units: [],
      products: [],
      inventoryBalances: [],
      productWarehouseValuations: [],
    };
  }
  return {
    units: plan.units.map(({ code, name }) => ({ code, name })),
    products: plan.products.map(
      ({ code, name, unitId, minimumStock, createdAt }) => ({
        code,
        name,
        unitId,
        minimumStock,
        createdAt,
      }),
    ),
    inventoryBalances: plan.inventoryBalances.map(
      ({
        productId,
        warehouseCode,
        quantity,
        currentUnitPrice,
        currentUnitCost,
        priceReviewRequired,
        costReviewRequired,
      }) => ({
        productId,
        warehouseCode,
        quantity,
        currentUnitPrice,
        currentUnitCost,
        priceReviewRequired,
        costReviewRequired,
      }),
    ),
    productWarehouseValuations: plan.productWarehouseValuations.map(
      ({
        productId,
        warehouseCode,
        unitPrice,
        unitCost,
        observedAt,
        effectiveAt,
        requiresHumanReview,
        reviewReason,
      }) => ({
        productId,
        warehouseCode,
        unitPrice,
        unitCost,
        observedAt,
        effectiveAt,
        requiresHumanReview,
        reviewReason,
      }),
    ),
  };
}

export function approvedPlanKey(input: {
  sourceCode: string;
  sourceSha256: string;
  manifestSha256: string;
  mappingSha256: string;
  mappingVersion: string;
  importerVersion: string;
  businessPlan: Wave12BusinessPlan | undefined;
}): string {
  return canonicalFingerprint({
    sourceCode: input.sourceCode,
    sourceSha256: input.sourceSha256,
    manifestSha256: input.manifestSha256,
    mappingSha256: input.mappingSha256,
    mappingVersion: input.mappingVersion,
    importerVersion: input.importerVersion,
    businessPlan: canonicalBusinessPlan(input.businessPlan),
  });
}
