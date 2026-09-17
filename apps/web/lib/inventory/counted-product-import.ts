export const COUNTED_PRODUCT_SHEET = 'Conteo Fisico Inicial';

const headers = {
  code: 'SKU INTUITIVO',
  description: 'DESCRIPCIÓN',
  minimumStock: 'STOCK MÍNIMO',
  name: 'NOMBRE DEL PRODUCTO',
  previousCode: 'CÓDIGO ANTERIOR',
  unitCost: 'COSTO UNITARIO (C$)',
  unitPrice: 'PRECIO VENTA (C$)',
  warehouses: [
    { code: 'CASA_DYLAN', header: 'CASA DYLAN (FÍSICO)', name: 'Casa Dylan' },
    { code: 'CASA_JEAN', header: 'CASA JEAN (FÍSICO)', name: 'Casa Jean' },
    { code: 'CASA_LUDEN', header: 'CASA LUDEN (FÍSICO)', name: 'Casa Luden' },
  ],
} as const;

export interface CountedWarehouseQuantity {
  code: string;
  name: string;
  quantity: string;
}

export interface CountedProductRow {
  code: string;
  description: string;
  minimumStock: string;
  name: string;
  previousCode: string;
  rowNumber: number;
  unitCost: string;
  unitPrice: string;
  warehouses: CountedWarehouseQuantity[];
}

export interface CountedProductWorkbook {
  rows: CountedProductRow[];
  totalQuantity: string;
}

function headerText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function decimal(value: unknown, label: string, rowNumber: number): string {
  if (value === null || value === undefined || value === '') return '0';
  const text = String(value).trim().replace(',', '.');
  if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/u.test(text)) {
    throw new Error(`${label} inválido en la fila ${rowNumber}.`);
  }
  return text;
}

function money(value: unknown, label: string, rowNumber: number): string {
  const text = decimal(value, label, rowNumber);
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/u.test(text)) {
    throw new Error(
      `${label} debe tener como máximo dos decimales en la fila ${rowNumber}.`,
    );
  }
  return text;
}

function positiveMoney(
  value: unknown,
  label: string,
  rowNumber: number,
): string {
  const text = money(value, label, rowNumber);
  if (/^0(?:\.0+)?$/u.test(text)) {
    throw new Error(
      `${label} debe ser mayor que cero en la fila ${rowNumber}.`,
    );
  }
  return text;
}

function sumDecimals(values: readonly string[]): string {
  const scale = 10_000n;
  const total = values.reduce((sum, value) => {
    const [whole = '0', fraction = ''] = value.split('.');
    return sum + BigInt(whole) * scale + BigInt(fraction.padEnd(4, '0'));
  }, 0n);
  const whole = total / scale;
  const fraction = String(total % scale)
    .padStart(4, '0')
    .replace(/0+$/u, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function parseCountedProductRows(
  matrix: readonly (readonly unknown[])[],
): CountedProductWorkbook {
  const [headerRow, ...dataRows] = matrix;
  if (!headerRow) throw new Error('La hoja está vacía.');

  const index = new Map(
    headerRow.map((value, column) => [headerText(value), column]),
  );
  const required = [
    headers.code,
    headers.name,
    headers.previousCode,
    headers.description,
    headers.unitPrice,
    headers.unitCost,
    headers.minimumStock,
    ...headers.warehouses.map(({ header }) => header),
  ];
  const missing = required.filter((header) => !index.has(headerText(header)));
  if (missing.length) {
    throw new Error(`Faltan columnas requeridas: ${missing.join(', ')}.`);
  }

  const column = (name: string) => index.get(headerText(name))!;
  const rows = dataRows.flatMap((source, offset): CountedProductRow[] => {
    const rowNumber = offset + 2;
    const physicalValues = headers.warehouses.map(
      (warehouse) => source[column(warehouse.header)],
    );
    const code = String(source[column(headers.code)] ?? '')
      .trim()
      .toUpperCase();
    const name = String(source[column(headers.name)] ?? '').trim();
    if (!code && !name) return [];
    if (!code && /^TOTAL\b/iu.test(name)) return [];
    if (
      physicalValues.every(
        (value) => value === null || value === undefined || value === '',
      )
    ) {
      return [];
    }
    if (!code || !name) {
      throw new Error(`SKU o nombre incompleto en la fila ${rowNumber}.`);
    }
    if (code.length > 64 || name.length > 200) {
      throw new Error(`SKU o nombre demasiado largo en la fila ${rowNumber}.`);
    }
    const description = String(
      source[column(headers.description)] ?? '',
    ).trim();
    if (description.length > 2000) {
      throw new Error(`Descripción demasiado larga en la fila ${rowNumber}.`);
    }
    return [
      {
        code,
        description,
        minimumStock: decimal(
          source[column(headers.minimumStock)],
          'Stock mínimo',
          rowNumber,
        ),
        name,
        previousCode: String(source[column(headers.previousCode)] ?? '').trim(),
        rowNumber,
        unitCost: money(
          source[column(headers.unitCost)],
          'Costo unitario',
          rowNumber,
        ),
        unitPrice: positiveMoney(
          source[column(headers.unitPrice)],
          'Precio de venta',
          rowNumber,
        ),
        warehouses: headers.warehouses.map((warehouse, warehouseIndex) => ({
          code: warehouse.code,
          name: warehouse.name,
          quantity: decimal(
            physicalValues[warehouseIndex],
            warehouse.name,
            rowNumber,
          ),
        })),
      },
    ];
  });

  const duplicates = rows
    .map(({ code }) => code)
    .filter((code, position, codes) => codes.indexOf(code) !== position);
  if (duplicates.length) {
    throw new Error(
      `Hay SKU duplicados: ${[...new Set(duplicates)].join(', ')}.`,
    );
  }
  if (!rows.length) throw new Error('La hoja no contiene productos.');

  return {
    rows,
    totalQuantity: sumDecimals(
      rows.flatMap(({ warehouses }) =>
        warehouses.map(({ quantity }) => quantity),
      ),
    ),
  };
}

export function positiveWarehouseQuantities(row: CountedProductRow) {
  return row.warehouses.filter(
    ({ quantity }) => !/^0(?:\.0+)?$/u.test(quantity),
  );
}
