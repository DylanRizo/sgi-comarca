import { ForbiddenException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { REQUIRED_PERMISSION_METADATA } from '../auth/decorators/require-permission.decorator.js';
import { InventoryAdjustmentDto } from './dto/inventory-adjustment.dto.js';
import { InventoryTransferDto } from './dto/inventory-transfer.dto.js';
import {
  InventoryController,
  mapInventoryAdjustmentError,
  mapInventoryTransferError,
} from './inventory.controller.js';
import { InventoryAdjustmentError } from './inventory-adjustment.service.js';
import { InventoryHttpException } from './inventory-http.exception.js';
import { InventoryTransferError } from './inventory-transfer.service.js';

describe('InventoryController adjustment boundary', () => {
  it('requires exactly inventory.adjust', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_METADATA,
        InventoryController.prototype.adjust,
      ),
    ).toBe('inventory.adjust');
  });

  it('requires exactly transfers.create for transfer writes', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_METADATA,
        InventoryController.prototype.transfer,
      ),
    ).toBe('transfers.create');
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

  it('strictly validates the transfer payload', async () => {
    const pipe = new ValidationPipe({
      expectedType: InventoryTransferDto,
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    });
    const valid = await pipe.transform(
      {
        fromWarehouseId: '00000000-0000-4000-8000-000000000001',
        productId: '00000000-0000-4000-8000-000000000002',
        quantity: '1.25',
        reason: 'Reubicacion controlada',
        toWarehouseId: '00000000-0000-4000-8000-000000000003',
      },
      { metatype: InventoryTransferDto, type: 'body' },
    );
    expect(valid).toBeInstanceOf(InventoryTransferDto);

    for (const invalid of [
      { ...valid, quantity: '0.00001' },
      { ...valid, reason: '   ' },
      { ...valid, productId: 'not-a-uuid' },
      { ...valid, unexpected: true },
    ]) {
      await expect(
        pipe.transform(invalid, {
          metatype: InventoryTransferDto,
          type: 'body',
        }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    }
  });

  it('maps transfer conflicts and authorization to safe public errors', () => {
    expect(() =>
      mapInventoryTransferError(
        new InventoryTransferError('IDEMPOTENCY_KEY_REUSED'),
      ),
    ).toThrowError(InventoryHttpException);
    expect(() =>
      mapInventoryTransferError(
        new InventoryTransferError('INVENTORY_PERMISSION_DENIED'),
      ),
    ).toThrowError(ForbiddenException);
  });
});
