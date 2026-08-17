import { ValidationPipe } from '@nestjs/common';

import {
  CatalogListQueryDto,
  InventoryListQueryDto,
  ProductInventoryQueryDto,
} from './dto/read-query.dto.js';

function explicitReadQueryPipe(expectedType: new () => object): ValidationPipe {
  return new ValidationPipe({
    expectedType,
    forbidNonWhitelisted: true,
    transform: true,
    whitelist: true,
  });
}

export const catalogListQueryPipe = explicitReadQueryPipe(CatalogListQueryDto);
export const inventoryListQueryPipe = explicitReadQueryPipe(
  InventoryListQueryDto,
);
export const productInventoryQueryPipe = explicitReadQueryPipe(
  ProductInventoryQueryDto,
);
