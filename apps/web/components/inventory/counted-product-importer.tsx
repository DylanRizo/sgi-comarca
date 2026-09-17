'use client';

import type {
  ProductGroupView,
  UnitSummary,
  WarehouseSummary,
} from '@sgi/contracts';
import Link from 'next/link';
import { useState } from 'react';
import * as XLSX from 'xlsx';

import { inventoryApi } from '@/lib/http/inventory-api';
import { ApiHttpError } from '@/lib/http/api-client';
import { stockOperationsApi } from '@/lib/http/stock-operations-api';
import {
  COUNTED_PRODUCT_SHEET,
  parseCountedProductRows,
  positiveWarehouseQuantities,
  type CountedProductRow,
  type CountedProductWorkbook,
} from '@/lib/inventory/counted-product-import';
import { useAuth } from '@/providers/auth-provider';

type ImportState =
  | { kind: 'idle' }
  | { kind: 'ready'; fileHash: string; workbook: CountedProductWorkbook }
  | { completed: number; kind: 'running'; total: number }
  | { errors: string[]; imported: number; kind: 'complete'; total: number };

async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function operationKey(
  fileHash: string,
  operation: string,
  code: string,
): Promise<string> {
  return `count-v1-${await sha256(`${fileHash}:${operation}:${code}`)}`;
}

function catalogByCode<T extends { code: string }>(
  items: readonly T[],
  code: string,
  label: string,
): T {
  const item = items.find((candidate) => candidate.code === code);
  if (!item) throw new Error(`No existe ${label} ${code} en el SGI.`);
  return item;
}

function errorText(error: unknown, code: string): string {
  if (
    error instanceof ApiHttpError &&
    error.code === 'PRODUCT_CODE_DUPLICATE'
  ) {
    return `${code}: el SKU ya existe y no corresponde a esta misma carga.`;
  }
  return `${code}: no se pudo importar. Reintenta la misma hoja.`;
}

export function CountedProductImporter() {
  const { getCsrfToken, state: auth } = useAuth();
  const [state, setState] = useState<ImportState>({ kind: 'idle' });
  const [readError, setReadError] = useState('');
  const permissions =
    auth.kind === 'authenticated' ? auth.session.permissions : [];
  const allowed =
    permissions.includes('products.manage') &&
    permissions.includes('stock-receipts.create') &&
    permissions.includes('inventory.valuation.manage') &&
    permissions.includes('finances.read');

  async function selectFile(file: File | undefined) {
    setReadError('');
    setState({ kind: 'idle' });
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('El archivo supera el límite de 5 MB.');
      }
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { cellDates: false, raw: true });
      const sheet = workbook.Sheets[COUNTED_PRODUCT_SHEET];
      if (!sheet) {
        throw new Error(`No existe la hoja “${COUNTED_PRODUCT_SHEET}”.`);
      }
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        blankrows: false,
        defval: '',
        header: 1,
        raw: true,
      });
      if (matrix.length > 1001) {
        throw new Error('La hoja supera el límite de 1,000 productos.');
      }
      setState({
        fileHash: await sha256(bytes),
        kind: 'ready',
        workbook: parseCountedProductRows(matrix),
      });
    } catch (error) {
      setReadError(
        error instanceof Error
          ? error.message
          : 'No se pudo leer la hoja de cálculo.',
      );
    }
  }

  async function importRow(
    row: CountedProductRow,
    fileHash: string,
    csrf: string,
    catalogs: {
      group: ProductGroupView;
      unit: UnitSummary;
      warehouses: readonly WarehouseSummary[];
    },
  ) {
    const positive = positiveWarehouseQuantities(row);
    const [first, ...remaining] = positive;
    const created = await stockOperationsApi.createProduct(
      {
        code: row.code,
        description: row.description,
        groupId: catalogs.group.id,
        minimumStock: row.minimumStock,
        name: row.name,
        unitId: catalogs.unit.id,
        ...(first
          ? {
              initialReceipt: {
                quantity: first.quantity,
                reason: 'Conteo físico inicial importado desde hoja de cálculo',
                unitCost: row.unitCost,
                unitPrice: row.unitPrice,
                warehouseId: catalogByCode(
                  catalogs.warehouses,
                  first.code,
                  'la bodega',
                ).id,
              },
            }
          : {}),
      },
      csrf,
      await operationKey(fileHash, 'product', row.code),
    );
    for (const warehouse of remaining) {
      await stockOperationsApi.receive(
        {
          productId: created.product.id,
          quantity: warehouse.quantity,
          reason: 'Conteo físico inicial importado desde hoja de cálculo',
          unitCost: row.unitCost,
          unitPrice: row.unitPrice,
          warehouseId: catalogByCode(
            catalogs.warehouses,
            warehouse.code,
            'la bodega',
          ).id,
        },
        csrf,
        await operationKey(fileHash, `receipt:${warehouse.code}`, row.code),
      );
    }
  }

  async function startImport() {
    if (state.kind !== 'ready' || !allowed) return;
    const { fileHash, workbook } = state;
    setReadError('');
    setState({ completed: 0, kind: 'running', total: workbook.rows.length });
    const errors: string[] = [];
    let imported = 0;
    try {
      const csrf = await getCsrfToken();
      const [unitsPage, groups, warehousesPage] = await Promise.all([
        stockOperationsApi.units(),
        stockOperationsApi.groups(),
        inventoryApi.warehouses(),
      ]);
      const catalogs = {
        group: catalogByCode(groups, 'GENERAL', 'la categoría'),
        unit: catalogByCode(unitsPage.items, 'UNIDADES', 'la unidad'),
        warehouses: warehousesPage.items,
      };
      for (const row of workbook.rows) {
        try {
          await importRow(row, fileHash, csrf, catalogs);
          imported += 1;
        } catch (error) {
          errors.push(errorText(error, row.code));
        }
        setState({
          completed: imported + errors.length,
          kind: 'running',
          total: workbook.rows.length,
        });
      }
      setState({
        errors,
        imported,
        kind: 'complete',
        total: workbook.rows.length,
      });
    } catch {
      setReadError(
        'No se pudieron preparar los catálogos o la sesión. Reintenta.',
      );
      setState({ fileHash, kind: 'ready', workbook });
    }
  }

  return (
    <main className="content-page" id="main-content">
      <Link className="back-link" href="/products">
        Volver a productos
      </Link>
      <header className="page-heading">
        <div>
          <h1>Importar conteo de productos</h1>
          <p>
            Revisa una hoja de conteo antes de crear fichas, entradas y
            movimientos auditados.
          </p>
        </div>
      </header>

      {!allowed ? (
        <p role="alert">
          Necesitas permisos de productos, entradas y valoración para importar.
        </p>
      ) : (
        <section className="work-panel">
          <label className="filter-field">
            <span>Archivo Excel (.xlsx)</span>
            <input
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={state.kind === 'running'}
              onChange={(event) => void selectFile(event.target.files?.[0])}
              type="file"
            />
          </label>
          <p>
            La unidad será <strong>Unidades</strong> y la categoría{' '}
            <strong>General</strong>. Los totales se calculan desde las tres
            columnas físicas; la columna “Total en La Comarca” no se usa.
          </p>
        </section>
      )}

      {readError ? (
        <p className="inline-error" role="alert">
          {readError}
        </p>
      ) : null}
      {state.kind === 'ready' ? (
        <>
          <section className="work-panel">
            <h2>Vista previa</h2>
            <p>
              {state.workbook.rows.length} productos ·{' '}
              {state.workbook.totalQuantity} unidades físicas ·{' '}
              {
                state.workbook.rows.filter(
                  (row) => positiveWarehouseQuantities(row).length === 0,
                ).length
              }{' '}
              productos sin existencia.
            </p>
            <p>
              Los productos con cero se crearán sin movimiento ni valoración;
              costo y precio se registrarán cuando reciban existencias.
            </p>
          </section>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Casa Dylan</th>
                  <th>Casa Jean</th>
                  <th>Casa Luden</th>
                </tr>
              </thead>
              <tbody>
                {state.workbook.rows.map((row) => (
                  <tr key={row.code}>
                    <td>{row.rowNumber}</td>
                    <td>
                      <strong>{row.code}</strong>
                    </td>
                    <td>{row.name}</td>
                    {row.warehouses.map((warehouse) => (
                      <td key={warehouse.code}>{warehouse.quantity}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="operation-toolbar">
            <button
              className="primary-button"
              onClick={() => void startImport()}
            >
              Importar productos y existencias
            </button>
          </div>
        </>
      ) : state.kind === 'running' ? (
        <p role="status">
          Importando {state.completed} de {state.total}… No cierres esta página.
        </p>
      ) : state.kind === 'complete' ? (
        <section className="work-panel" role="status">
          <h2>Importación terminada</h2>
          <p>
            {state.imported} de {state.total} productos procesados
            correctamente.
          </p>
          {state.errors.length ? (
            <>
              <p role="alert">Revisa estos resultados antes de reintentar:</p>
              <ul>
                {state.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </>
          ) : (
            <Link className="primary-button" href="/products">
              Ver productos
            </Link>
          )}
        </section>
      ) : null}
    </main>
  );
}
