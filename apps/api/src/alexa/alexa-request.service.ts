import {
  handleAlexaRequest,
  type AlexaRequestEnvelope,
  type AlexaResponseEnvelope,
} from '@sgi/alexa-adapter';

import type { InventoryReadService } from '../inventory/inventory-read.service.js';
import type { ProductReadService } from '../products/product-read.service.js';
import type { SaleReadService } from '../sales/sale-read.service.js';
import type { WarehouseReadService } from '../warehouses/warehouse-read.service.js';
import type { ValidAlexaAccess } from './alexa-oauth.service.js';
import type { AlexaOAuthService } from './alexa-oauth.service.js';
import {
  AlexaInventoryGateway,
  AlexaSalesGateway,
} from './alexa-read.gateway.js';

export class AlexaRequestService {
  constructor(
    private readonly products: ProductReadService,
    private readonly warehouses: WarehouseReadService,
    private readonly inventory: InventoryReadService,
    private readonly sales: SaleReadService,
    private readonly oauth: AlexaOAuthService,
  ) {}

  async handle(
    access: ValidAlexaAccess,
    envelope: AlexaRequestEnvelope,
  ): Promise<AlexaResponseEnvelope> {
    const result = await handleAlexaRequest(
      envelope,
      new AlexaInventoryGateway(this.products, this.warehouses, this.inventory),
      new AlexaSalesGateway(this.sales),
    );
    await this.oauth.recordQuery(
      access,
      envelope.request.type,
      envelope.request.intent?.name,
    );
    return result;
  }
}
