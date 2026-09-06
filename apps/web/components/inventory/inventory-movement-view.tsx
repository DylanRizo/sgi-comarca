'use client';

import type {
  InventoryMovementType,
  InventoryMovementView as InventoryMovement,
  PaginatedData,
  ProductInventoryView,
  WarehouseSummary,
} from '@sgi/contracts';
import { type FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { InventoryTransferDialog } from './inventory-transfer-dialog';

import { PaginationControls } from '@/components/inventory/pagination-controls';
import { ReadState, RetryButton } from '@/components/inventory/read-state';
import {
  type InventoryMovementQuery,
  inventoryApi,
} from '@/lib/http/inventory-api';
import { presentReadError } from '@/lib/inventory/read-error';
import { formatObservedAt, formatQuantity } from '@/lib/inventory/presentation';
import { useAuth } from '@/providers/auth-provider';

const visibleMovementTypes = [
  'INITIAL_BALANCE',
  'LEGACY',
  'RECEIPT',
  'ADJUSTMENT',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'SALE',
  'SALE_CANCELLATION',
] as const satisfies readonly InventoryMovementType[];

function movementLabel(type: InventoryMovementType): string {
  if (type === 'INITIAL_BALANCE') return 'Saldo inicial';
  if (type === 'LEGACY') return 'Registro heredado';
  if (type === 'RECEIPT') return 'Entrada';
  if (type === 'TRANSFER_OUT') return 'Transferencia · salida';
  if (type === 'TRANSFER_IN') return 'Transferencia · entrada';
  if (type === 'ADJUSTMENT') return 'Ajuste';
  if (type === 'SALE') return 'Venta';
  if (type === 'SALE_CANCELLATION') return 'Cancelación de venta';
  return 'Movimiento';
}

function sourceHref(movement: InventoryMovement): Route | null {
  if (!movement.sourceId) return null;
  if (movement.sourceType === 'STOCK_RECEIPT')
    return `/inventory/receipts/${movement.sourceId}` as Route;
  if (movement.sourceType === 'SALE')
    return `/sales/${movement.sourceId}` as Route;
  return null;
}

interface MovementState {
  movements: PaginatedData<InventoryMovement>;
  products: readonly ProductInventoryView[];
  warehouses: readonly WarehouseSummary[];
}

interface MovementDraft {
  from: string;
  movementType: '' | InventoryMovementType;
  productId: string;
  to: string;
  warehouseId: string;
}

const emptyDraft: MovementDraft = {
  from: '',
  movementType: '',
  productId: '',
  to: '',
  warehouseId: '',
};

export function InventoryMovementView() {
  const { refreshSession, state: auth } = useAuth();
  const permissions =
    auth.kind === 'authenticated' ? auth.session.permissions : [];
  const [transferOpen, setTransferOpen] = useState(false);
  const [draft, setDraft] = useState<MovementDraft>(emptyDraft);
  const [filters, setFilters] = useState<InventoryMovementQuery>({});
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<MovementState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const scheduledLoad = window.setTimeout(() => {
      void (async () => {
        const movements = await inventoryApi.movements(
          { ...filters, page, pageSize: 25 },
          controller.signal,
        );
        const products = await inventoryApi.allInventory(controller.signal);
        const warehouses = await inventoryApi.warehouses(controller.signal);
        return { movements, products, warehouses };
      })()
        .then(({ movements, products, warehouses }) => {
          setError(null);
          setState({ movements, products, warehouses: warehouses.items });
        })
        .catch((requestError: unknown) => {
          if (controller.signal.aborted) return;
          setError(requestError);
          void refreshSession().catch(() => undefined);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(scheduledLoad);
      controller.abort();
    };
  }, [filters, page, refreshSession, reload]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setPage(1);
    setFilters({
      ...(draft.from ? { from: draft.from } : {}),
      ...(draft.movementType ? { movementType: draft.movementType } : {}),
      ...(draft.productId ? { productId: draft.productId } : {}),
      ...(draft.to ? { to: draft.to } : {}),
      ...(draft.warehouseId ? { warehouseId: draft.warehouseId } : {}),
    });
  }

  const errorPresentation = error ? presentReadError(error) : null;

  return (
    <main className="content-page" id="main-content">
      <header className="page-heading">
        <div>
          <h1>Movimientos de inventario</h1>
          <p>
            Realiza las operaciones diarias y consulta su historial completo.
          </p>
        </div>
        {state ? (
          <span className="result-count">
            {state.movements.pagination.totalItems} movimientos
          </span>
        ) : null}
      </header>
      <section aria-labelledby="operation-title" className="detail-section">
        <h2 id="operation-title">¿Qué necesitas hacer?</h2>
        <div className="operation-toolbar">
          {permissions.includes('stock-receipts.create') ? (
            <Link
              className="primary-button"
              href={'/inventory/receipts/new' as Route}
            >
              Registrar entrada
            </Link>
          ) : null}
          {permissions.includes('transfers.create') ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setTransferOpen(true)}
            >
              Transferir
            </button>
          ) : null}
          {permissions.includes('inventory.adjust') ? (
            <Link
              className="secondary-button"
              href={'/inventory/adjustments/new' as Route}
            >
              Ajustar existencias
            </Link>
          ) : null}
          {permissions.includes('sales.create') ? (
            <Link
              className="secondary-button"
              href={'/sales?create=1' as Route}
            >
              Registrar venta
            </Link>
          ) : null}
        </div>
      </section>

      <form className="filter-bar movement-filters" onSubmit={submit}>
        <label className="filter-field">
          <span>Producto</span>
          <select
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                productId: event.target.value,
              }))
            }
            value={draft.productId}
          >
            <option value="">Todos los productos</option>
            {state?.products.map(({ product }) => (
              <option key={product.id} value={product.id}>
                {product.code} · {product.name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Bodega</span>
          <select
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                warehouseId: event.target.value,
              }))
            }
            value={draft.warehouseId}
          >
            <option value="">Todas las bodegas</option>
            {state?.warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name} ({warehouse.code})
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Tipo</span>
          <select
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                movementType: event.target.value as '' | InventoryMovementType,
              }))
            }
            value={draft.movementType}
          >
            <option value="">Todos los tipos</option>
            {visibleMovementTypes.map((type) => (
              <option key={type} value={type}>
                {movementLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Desde</span>
          <input
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                from: event.target.value,
              }))
            }
            type="date"
            value={draft.from}
          />
        </label>
        <label className="filter-field">
          <span>Hasta</span>
          <input
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                to: event.target.value,
              }))
            }
            type="date"
            value={draft.to}
          />
        </label>
        <button className="primary-button" type="submit">
          Aplicar filtros
        </button>
      </form>

      {loading ? (
        <ReadState title="Cargando movimientos">
          <p>Consultando el ledger de inventario…</p>
        </ReadState>
      ) : errorPresentation ? (
        <ReadState
          action={
            <RetryButton
              onRetry={() => {
                setLoading(true);
                setReload((value) => value + 1);
              }}
            />
          }
          title={errorPresentation.title}
          tone={errorPresentation.tone}
        >
          <p>{errorPresentation.message}</p>
        </ReadState>
      ) : state?.movements.items.length === 0 ? (
        <ReadState
          title={
            Object.keys(filters).length === 0
              ? 'Todavía no hay movimientos'
              : 'Sin movimientos'
          }
        >
          <p>
            {Object.keys(filters).length === 0
              ? 'Registra una entrada, una transferencia, un ajuste o una venta y su historial aparecerá aquí.'
              : 'No hay movimientos que coincidan con los filtros.'}
          </p>
        </ReadState>
      ) : state ? (
        <>
          <div className="data-table-wrap">
            <table className="data-table movement-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Tipo</th>
                  <th>Bodega</th>
                  <th>Delta</th>
                  <th>Saldo</th>
                  <th>Actor / origen</th>
                  <th>Transferencia</th>
                </tr>
              </thead>
              <tbody>
                {state.movements.items.map((movement) => (
                  <tr key={movement.id}>
                    <td data-label="Fecha">
                      {formatObservedAt(movement.occurredAt)}
                    </td>
                    <td data-label="Producto">
                      <strong>{movement.product.code}</strong>
                      <span>{movement.product.name}</span>
                    </td>
                    <td data-label="Tipo">
                      <span className="status-badge">
                        {movementLabel(movement.type)}
                      </span>
                    </td>
                    <td data-label="Bodega">{movement.warehouse.code}</td>
                    <td data-label="Delta">
                      <strong>{formatQuantity(movement.quantityDelta)}</strong>
                    </td>
                    <td data-label="Saldo">
                      {formatQuantity(movement.balanceBefore)} →{' '}
                      {formatQuantity(movement.balanceAfter)}
                    </td>
                    <td data-label="Responsable / origen">
                      {movement.actor?.displayName ?? 'Sistema'}
                      <span>
                        {sourceHref(movement) ? (
                          <Link
                            className="table-link"
                            href={sourceHref(movement)!}
                          >
                            Ver documento de origen
                          </Link>
                        ) : (
                          (movement.sourceType ?? 'Sin referencia')
                        )}
                      </span>
                    </td>
                    <td data-label="Transferencia">
                      {movement.transfer ? (
                        <>
                          {movement.transfer.fromWarehouse.code} →{' '}
                          {movement.transfer.toWarehouse.code}
                        </>
                      ) : (
                        'No aplica'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls
            onPage={(nextPage) => {
              setLoading(true);
              setPage(nextPage);
            }}
            pagination={state.movements.pagination}
          />
        </>
      ) : null}
      {transferOpen ? (
        <InventoryTransferDialog
          onCancel={() => setTransferOpen(false)}
          onSuccess={() => {
            setTransferOpen(false);
            setLoading(true);
            setReload((value) => value + 1);
          }}
        />
      ) : null}
    </main>
  );
}
