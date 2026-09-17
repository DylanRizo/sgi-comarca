import {
  normalizeSaleNumber,
  type InventoryLookupPort,
  type SaleLookupPort,
} from '@sgi/alexa-adapter';

import type { InventoryReadService } from '../inventory/inventory-read.service.js';
import type { ProductReadService } from '../products/product-read.service.js';
import type { SaleReadService } from '../sales/sale-read.service.js';
import type { WarehouseReadService } from '../warehouses/warehouse-read.service.js';

export class AlexaInventoryGateway implements InventoryLookupPort {
  constructor(
    private readonly products: ProductReadService,
    private readonly warehouses: WarehouseReadService,
    private readonly inventory: InventoryReadService,
  ) {}

  async searchProducts(query: string) {
    return (
      await this.products.list({
        active: true,
        page: 1,
        pageSize: 10,
        search: query,
      })
    ).items;
  }

  async searchWarehouses(query: string) {
    return (
      await this.warehouses.list({
        active: true,
        page: 1,
        pageSize: 10,
        search: query,
      })
    ).items;
  }

  async getProductInventory(productId: string, warehouseId: string) {
    const view = await this.inventory.getProduct(productId, { warehouseId });
    return {
      ...view,
      balances: view.balances.map((balance) => ({
        ...balance,
        canReadCost: false,
        costReviewRequired: false,
        currentUnitCost: null,
        currentUnitPrice: null,
        priceReviewRequired: false,
        valuations: [],
      })),
    };
  }
}

export class AlexaSalesGateway implements SaleLookupPort {
  constructor(private readonly sales: SaleReadService) {}

  async listSalesInTransit() {
    return this.sales.listVoiceInTransit(3);
  }

  async searchSalesByNumber(query: string) {
    return this.sales.findVoiceByNumber(normalizeSaleNumber(query));
  }
}
