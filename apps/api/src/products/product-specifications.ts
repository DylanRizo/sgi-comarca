import { productPhotosFolderUrl, type ProductInput } from '@sgi/contracts';
import type { Prisma, DatabaseClient } from '@sgi/database';
import { EffectivePermissionsService } from '../auth/application/effective-permissions.service.js';
import { StockOperationError } from '../inventory/stock-command.js';

export interface ProductSpecifications {
  materialsDescription: string | null;
  measurementChart: string | null;
  photosUrl: string | null;
}

export function resolveProductSpecifications(
  input: ProductInput,
  before?: ProductSpecifications,
): ProductSpecifications {
  const text = (value: unknown, previous: string | null, limit: number) => {
    if (value === undefined) return previous;
    if (value === null) return null;
    if (typeof value !== 'string' || value.length > limit)
      throw new StockOperationError('STOCK_REQUEST_INVALID');
    return value.trim() || null;
  };
  const photos = productPhotosFolderUrl(input.photosUrl, URL);
  if (!photos.valid) throw new StockOperationError('STOCK_REQUEST_INVALID');
  return {
    materialsDescription: text(
      input.materialsDescription,
      before?.materialsDescription ?? null,
      4000,
    ),
    measurementChart: text(
      input.measurementChart,
      before?.measurementChart ?? null,
      8000,
    ),
    photosUrl:
      input.photosUrl === undefined
        ? (before?.photosUrl ?? null)
        : photos.value,
  };
}

/** A delegable capability, never an ADMIN/username bypass of effective DENY. */
export async function canEditProductSpecifications(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
): Promise<boolean> {
  const actor = await transaction.user.findUnique({
    where: { id: actorUserId },
    select: {
      status: true,
      activatedAt: true,
    },
  });
  if (actor?.status !== 'ACTIVE' || !actor.activatedAt) return false;
  const permissions = new EffectivePermissionsService(
    transaction as DatabaseClient,
  );
  return (
    (await permissions.hasPermissionUsing(
      transaction,
      actorUserId,
      'products.manage',
    )) &&
    (await permissions.hasPermissionUsing(
      transaction,
      actorUserId,
      'products.specifications.manage',
    ))
  );
}
