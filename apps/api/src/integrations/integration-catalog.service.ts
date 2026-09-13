import type { IntegrationCatalogItem, PaginatedData } from '@sgi/contracts';

import { InventoryListQueryDto } from '../common/dto/read-query.dto.js';
import type { PageInput } from '../common/pagination.js';
import type { InventoryReadService } from '../inventory/inventory-read.service.js';
import { projectCatalogItem } from './integration-catalog.projection.js';

/**
 * Delegates to the inventory read model rather than querying tables itself, so
 * stock is never recalculated outside its owning module (same boundary as the
 * Alexa gateways in ADR-016).
 */
export class IntegrationCatalogService {
  constructor(private readonly inventory: InventoryReadService) {}

  async list(input: PageInput): Promise<PaginatedData<IntegrationCatalogItem>> {
    const query = Object.assign(new InventoryListQueryDto(), {
      active: true,
      availableOnly: true,
      page: input.page,
      pageSize: input.pageSize,
    });
    const page = await this.inventory.list(query);
    return {
      items: page.items.map(projectCatalogItem),
      pagination: page.pagination,
    };
  }
}
