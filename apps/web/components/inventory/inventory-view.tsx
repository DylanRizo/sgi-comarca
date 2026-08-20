'use client';

import type {
  InventoryAdjustmentResult,
  InventoryBalanceView,
  PaginatedData,
  ProductDetail,
  ProductInventoryView,
  WarehouseSummary,
} from '@sgi/contracts';
import { type FormEvent, useEffect, useState } from 'react';

import { InventorySummaryTable } from '@/components/inventory/inventory-summary-table';
import {
  InventoryAdjustmentDialog,
  type InventoryAdjustmentSelection,
} from '@/components/inventory/inventory-adjustment-dialog';
import { PaginationControls } from '@/components/inventory/pagination-controls';
import { ReadState, RetryButton } from '@/components/inventory/read-state';
import { inventoryApi } from '@/lib/http/inventory-api';
import { presentReadError } from '@/lib/inventory/read-error';
import { formatQuantity } from '@/lib/inventory/presentation';
import { useAuth } from '@/providers/auth-provider';

interface InventoryState {
  inventory: PaginatedData<ProductInventoryView>;
  warehouses: readonly WarehouseSummary[];
}

export function InventoryView() {
  const { refreshSession, state: authState } = useAuth();
  const [adjustment, setAdjustment] =
    useState<InventoryAdjustmentSelection | null>(null);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [draftSearch, setDraftSearch] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [state, setState] = useState<InventoryState | null>(null);
  const [success, setSuccess] = useState<InventoryAdjustmentResult | null>(
    null,
  );
  const [warehouseId, setWarehouseId] = useState('');

  useEffect(() => {
    let current = true;
    const request = window.setTimeout(() => {
      void (async () => {
        const inventory = await inventoryApi.inventory({
          active: true,
          availableOnly,
          page,
          pageSize: 25,
          ...(search ? { search } : {}),
          ...(warehouseId ? { warehouseId } : {}),
        });
        const warehouses = await inventoryApi.warehouses();
        return { inventory, warehouses: warehouses.items };
      })()
        .then((result) => {
          if (!current) return;
          setError(null);
          setState(result);
        })
        .catch((requestError: unknown) => {
          if (!current) return;
          setError(requestError);
          void refreshSession().catch(() => undefined);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 0);
    return () => {
      current = false;
      window.clearTimeout(request);
    };
  }, [availableOnly, page, refreshSession, reload, search, warehouseId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    setPage(1);
    setSearch(draftSearch.trim());
    setReload((value) => value + 1);
  }

  function beginRequest(action: () => void) {
    setError(null);
    setLoading(true);
    action();
  }

  const errorPresentation = error ? presentReadError(error) : null;
  const canAdjust =
    authState.kind === 'authenticated' &&
    authState.session.permissions.includes('inventory.adjust');

  function openAdjustment(
    product: ProductDetail,
    balance: InventoryBalanceView,
  ) {
    setSuccess(null);
    setAdjustment({ balance, product });
  }

  function adjusted(result: InventoryAdjustmentResult) {
    setAdjustment(null);
    setSuccess(result);
    beginRequest(() => setReload((value) => value + 1));
  }

  return (
    <>
      <main className="content-page" id="main-content">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Existencias</p>
            <h1>Inventario</h1>
            <p>
              Stock consolidado y desglose por almacén, consultados directamente
              desde el saldo operacional.
            </p>
          </div>
          {state ? (
            <span className="result-count">
              {state.inventory.pagination.totalItems} productos con saldo
            </span>
          ) : null}
        </header>

        {success ? (
          <section className="operation-success" role="status">
            <strong>Ajuste registrado.</strong> {success.product.code} en{' '}
            {success.warehouse.code}: {formatQuantity(success.balanceBefore)}{' '}
            {success.quantityDelta} = {formatQuantity(success.balanceAfter)}.
          </section>
        ) : null}

        <form className="filter-bar inventory-filters" onSubmit={submit}>
          <label className="filter-field">
            <span>Buscar producto</span>
            <input
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="Código o nombre"
              type="search"
              value={draftSearch}
            />
          </label>
          <label className="filter-field">
            <span>Almacén</span>
            <select
              onChange={(event) => {
                const value = event.target.value;
                beginRequest(() => {
                  setWarehouseId(value);
                  setPage(1);
                });
              }}
              value={warehouseId}
            >
              <option value="">Todos los almacenes</option>
              {state?.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-field">
            <input
              checked={availableOnly}
              onChange={(event) => {
                const checked = event.target.checked;
                beginRequest(() => {
                  setAvailableOnly(checked);
                  setPage(1);
                });
              }}
              type="checkbox"
            />
            <span>Solo con existencia disponible</span>
          </label>
          <button className="primary-button" type="submit">
            Buscar
          </button>
        </form>

        {loading ? (
          <ReadState title="Cargando inventario">
            <p>Consultando balances y valoraciones…</p>
          </ReadState>
        ) : errorPresentation ? (
          <ReadState
            action={
              <RetryButton
                onRetry={() =>
                  beginRequest(() => setReload((value) => value + 1))
                }
              />
            }
            title={errorPresentation.title}
            tone={errorPresentation.tone}
          >
            <p>{errorPresentation.message}</p>
          </ReadState>
        ) : state?.inventory.items.length === 0 ? (
          <ReadState title="Sin resultados">
            <p>
              No hay existencias que coincidan con los filtros seleccionados.
            </p>
          </ReadState>
        ) : state ? (
          <>
            <InventorySummaryTable
              canAdjust={canAdjust}
              items={state.inventory.items}
              onAdjust={openAdjustment}
            />
            <PaginationControls
              onPage={(nextPage) => beginRequest(() => setPage(nextPage))}
              pagination={state.inventory.pagination}
            />
          </>
        ) : null}
      </main>
      {adjustment ? (
        <InventoryAdjustmentDialog
          onCancel={() => setAdjustment(null)}
          onSuccess={adjusted}
          selection={adjustment}
        />
      ) : null}
    </>
  );
}
