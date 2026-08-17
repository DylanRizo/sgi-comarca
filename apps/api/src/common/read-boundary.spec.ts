import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { REQUIRED_PERMISSION_METADATA } from '../auth/decorators/require-permission.decorator.js';
import { InventoryController } from '../inventory/inventory.controller.js';
import { ProductsController } from '../products/products.controller.js';
import { UnitsController } from '../units/units.controller.js';
import { WarehousesController } from '../warehouses/warehouses.controller.js';
import {
  CatalogListQueryDto,
  InventoryListQueryDto,
} from './dto/read-query.dto.js';
import { ResourceIdParamDto } from './dto/resource-id-param.dto.js';
import { pageResult } from './pagination.js';
import { mapReadModelError, ReadModelNotFoundError } from './read-http.js';
import {
  catalogListQueryPipe,
  inventoryListQueryPipe,
} from './read-query.pipe.js';

describe('inventory read HTTP boundary', () => {
  const pipe = new ValidationPipe({
    forbidNonWhitelisted: true,
    transform: true,
    whitelist: true,
  });

  it('declares inventory.read exactly on every read controller', () => {
    for (const controller of [
      ProductsController,
      UnitsController,
      WarehousesController,
      InventoryController,
    ]) {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_METADATA, controller),
      ).toBe('inventory.read');
    }
  });

  it('applies bounded pagination defaults and rejects invalid queries', async () => {
    await expect(
      pipe.transform({}, { metatype: CatalogListQueryDto, type: 'query' }),
    ).resolves.toMatchObject({ page: 1, pageSize: 25 });
    await expect(
      pipe.transform(
        { page: '0' },
        { metatype: CatalogListQueryDto, type: 'query' },
      ),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    await expect(
      pipe.transform(
        { pageSize: '101' },
        { metatype: CatalogListQueryDto, type: 'query' },
      ),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    await expect(
      pipe.transform(
        { availableOnly: 'sometimes' },
        { metatype: InventoryListQueryDto, type: 'query' },
      ),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    await expect(
      pipe.transform(
        { unsupported: 'value' },
        { metatype: InventoryListQueryDto, type: 'query' },
      ),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it('transforms explicit read DTOs when runtime parameter metadata is absent', async () => {
    await expect(
      catalogListQueryPipe.transform(
        { active: 'false', page: '2', pageSize: '25' },
        { type: 'query' },
      ),
    ).resolves.toMatchObject({ active: false, page: 2, pageSize: 25 });
    await expect(
      inventoryListQueryPipe.transform(
        { active: 'true', availableOnly: 'false', page: '1', pageSize: '10' },
        { type: 'query' },
      ),
    ).resolves.toMatchObject({
      active: true,
      availableOnly: false,
      page: 1,
      pageSize: 10,
    });

    for (const invalid of [
      { page: 'abc' },
      { page: '0' },
      { pageSize: '101' },
      { active: 'foo' },
    ]) {
      await expect(
        catalogListQueryPipe.transform(invalid, { type: 'query' }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    }
  });

  it('rejects malformed UUIDs and maps missing resources to 404', async () => {
    await expect(
      pipe.transform(
        { id: '6cdcc3ac-bca6-849e-997a-91e9597ad952' },
        { metatype: ResourceIdParamDto, type: 'param' },
      ),
    ).resolves.toMatchObject({
      id: '6cdcc3ac-bca6-849e-997a-91e9597ad952',
    });
    await expect(
      pipe.transform(
        { id: 'not-a-uuid' },
        { metatype: ResourceIdParamDto, type: 'param' },
      ),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    try {
      mapReadModelError(new ReadModelNotFoundError('product'));
      throw new Error('Expected a mapped exception.');
    } catch (error) {
      expect(error).toMatchObject({ status: HttpStatus.NOT_FOUND });
    }
  });

  it('produces useful pagination metadata including an empty page', () => {
    expect(pageResult([], 0, { page: 1, pageSize: 25 }).pagination).toEqual({
      page: 1,
      pageSize: 25,
      totalItems: 0,
      totalPages: 0,
    });
    expect(pageResult(['x'], 26, { page: 2, pageSize: 25 }).pagination).toEqual(
      { page: 2, pageSize: 25, totalItems: 26, totalPages: 2 },
    );
  });
});
