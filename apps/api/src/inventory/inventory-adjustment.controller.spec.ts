import { ForbiddenException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { REQUIRED_PERMISSION_METADATA } from '../auth/decorators/require-permission.decorator.js';
import { InventoryAdjustmentDto } from './dto/inventory-adjustment.dto.js';
import {
  InventoryController,
  mapInventoryAdjustmentError,
} from './inventory.controller.js';
import { InventoryAdjustmentError } from './inventory-adjustment.service.js';
import { InventoryHttpException } from './inventory-http.exception.js';

describe('InventoryController adjustment boundary', () => {
  it('requires exactly inventory.adjust', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_METADATA,
        InventoryController.prototype.adjust,
      ),
    ).toBe('inventory.adjust');
  });

  it('strictly validates UUIDs, signed decimal delta and reason', async () => {
    const pipe = new ValidationPipe({
      expectedType: InventoryAdjustmentDto,
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    });
    const valid = await pipe.transform(
      {
        productId: '00000000-0000-4000-8000-000000000001',
        quantityDelta: '-1.25',
        reason: 'Conteo controlado',
        warehouseId: '00000000-0000-4000-8000-000000000002',
      },
      { metatype: InventoryAdjustmentDto, type: 'body' },
    );
    expect(valid).toBeInstanceOf(InventoryAdjustmentDto);

    for (const invalid of [
      { ...valid, quantityDelta: '0.00001' },
      { ...valid, reason: '   ' },
      { ...valid, productId: 'not-a-uuid' },
      { ...valid, unexpected: true },
    ]) {
      await expect(
        pipe.transform(invalid, {
          metatype: InventoryAdjustmentDto,
          type: 'body',
        }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    }
  });

  it('maps safe public errors without leaking internals', () => {
    expect(() =>
      mapInventoryAdjustmentError(
        new InventoryAdjustmentError('INVENTORY_NEGATIVE_BALANCE'),
      ),
    ).toThrowError(InventoryHttpException);
    expect(() =>
      mapInventoryAdjustmentError(
        new InventoryAdjustmentError('INVENTORY_PERMISSION_DENIED'),
      ),
    ).toThrowError(ForbiddenException);
  });
});
