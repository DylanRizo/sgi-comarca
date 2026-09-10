import type {
  ProductInventoryView,
  ProductSummary,
  WarehouseSummary,
} from '@sgi/contracts';

/**
 * Read-only boundary between the Alexa wording layer and SGI inventory.
 *
 * A production implementation must delegate to the authorized SGI read model;
 * it must not query inventory tables or reimplement stock rules here.
 */
export interface InventoryLookupPort {
  searchProducts(query: string): Promise<readonly ProductSummary[]>;
  searchWarehouses(query: string): Promise<readonly WarehouseSummary[]>;
  getProductInventory(
    productId: string,
    warehouseId: string,
  ): Promise<ProductInventoryView>;
}
