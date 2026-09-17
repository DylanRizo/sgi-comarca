import { describe, expect, it } from 'vitest';

import {
  parseCountedProductRows,
  positiveWarehouseQuantities,
} from './counted-product-import.js';

const header = [
  'SKU INTUITIVO',
  'CÓDIGO ANTERIOR',
  'NOMBRE DEL PRODUCTO',
  'DESCRIPCIÓN',
  'PRECIO VENTA (C$)',
  'COSTO UNITARIO (C$)',
  'STOCK MÍNIMO',
  'CASA DYLAN (FÍSICO)',
  'CASA JEAN (FÍSICO)',
  'CASA LUDEN (FÍSICO)',
  'TOTAL EN LA COMARCA',
  'NOTAS / OBSERVACIONES',
];

describe('counted product import', () => {
  it('uses warehouse counts instead of the potentially stale total column', () => {
    const parsed = parseCountedProductRows([
      header,
      ['SKU-1', 'OLD-1', 'Camisa uno', 'Azul', 250, 100, 2, 2, 3, 1, 4, ''],
      ['SKU-2', '', 'Camisa dos', '', 300, 120, 1, 0, '', '', '', ''],
      ['SKU-3', '', 'Camisa no contada', '', 300, 120, 1, '', '', '', '', ''],
      [
        '',
        '',
        'TOTAL GENERAL PRENDAS FÍSICAS:',
        '',
        '',
        '',
        '',
        6,
        0,
        0,
        4,
        '',
      ],
    ]);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.totalQuantity).toBe('6');
    expect(positiveWarehouseQuantities(parsed.rows[0]!)).toHaveLength(3);
    expect(positiveWarehouseQuantities(parsed.rows[1]!)).toHaveLength(0);
  });

  it('rejects duplicate SKU before any request is sent', () => {
    expect(() =>
      parseCountedProductRows([
        header,
        ['SKU-1', '', 'Camisa uno', '', 250, 100, 2, 1, 0, 0],
        ['sku-1', '', 'Camisa repetida', '', 250, 100, 2, 1, 0, 0],
      ]),
    ).toThrow('Hay SKU duplicados: SKU-1.');
  });
});
