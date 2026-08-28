'use client';

import type {
  PaginatedData,
  ProductInventoryView,
  ProductSummary,
} from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { PaginationControls } from '@/components/inventory/pagination-controls';
import { ReadState, RetryButton } from '@/components/inventory/read-state';
import { inventoryApi } from '@/lib/http/inventory-api';
import { formatQuantity, productRows } from '@/lib/inventory/presentation';
import { presentReadError } from '@/lib/http/read-error';
import { useAuth } from '@/providers/auth-provider';

type ActiveFilter = 'all' | 'false' | 'true';

interface CatalogState {
  inventory: readonly ProductInventoryView[];
  products: PaginatedData<ProductSummary>;
}

async function allInventory(
  query: { active?: boolean; search?: string },
  signal?: AbortSignal,
): Promise<readonly ProductInventoryView[]> {
  const first = await inventoryApi.inventory(
    { ...query, page: 1, pageSize: 100 },
    signal,
  );
  if (first.pagination.totalPages <= 1) return first.items;
  const remaining = await Promise.all(
    Array.from({ length: first.pagination.totalPages - 1 }, (_, index) =>
      inventoryApi.inventory(
        { ...query, page: index + 2, pageSize: 100 },
        signal,
      ),
    ),
  );
  return [first, ...remaining].flatMap((page) => page.items);
}

function activeValue(filter: ActiveFilter): boolean | undefined {
  return filter === 'all' ? undefined : filter === 'true';
}

export function ProductCatalogView() {
  const { refreshSession } = useAuth();
  const [active, setActive] = useState<ActiveFilter>('true');
  const [draftSearch, setDraftSearch] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [state, setState] = useState<CatalogState | null>(null);

  useEffect(() => {
    let current = true;
    const selectedActive = activeValue(active);
    const query = {
      ...(selectedActive === undefined ? {} : { active: selectedActive }),
      ...(search ? { search } : {}),
    };
    const request = window.setTimeout(() => {
      void (async () => {
        const products = await inventoryApi.products({
          ...query,
          page,
          pageSize: 25,
        });
        const inventory = await allInventory(query);
        return { inventory, products };
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
  }, [active, page, refreshSession, reload, search]);

  const rows = useMemo(
    () =>
      state ? productRows(state.products.items, state.inventory) : undefined,
    [state],
  );

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

  return (
    <main className="content-page" id="main-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1>Productos</h1>
          <p>
            Consulta códigos, unidades y existencias. Esta vista no permite
            modificar el inventario.
          </p>
        </div>
        {state ? (
          <span className="result-count">
            {state.products.pagination.totalItems} productos
          </span>
        ) : null}
      </header>

      <form className="filter-bar" onSubmit={submit}>
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
          <span>Estado</span>
          <select
            onChange={(event) => {
              const value = event.target.value as ActiveFilter;
              beginRequest(() => {
                setActive(value);
                setPage(1);
              });
            }}
            value={active}
          >
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
            <option value="all">Todos</option>
          </select>
        </label>
        <button className="primary-button" type="submit">
          Buscar
        </button>
      </form>

      {loading ? (
        <ReadState title="Cargando productos">
          <p>Consultando el catálogo y sus existencias…</p>
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
      ) : rows?.length === 0 ? (
        <ReadState title="Sin resultados">
          <p>No hay productos que coincidan con los filtros seleccionados.</p>
        </ReadState>
      ) : rows && state ? (
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Producto</th>
                  <th scope="col">Unidad</th>
                  <th scope="col">Stock total</th>
                  <th scope="col">Almacenes con existencia</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Código">
                      <strong>{row.code}</strong>
                    </td>
                    <td data-label="Producto">{row.name}</td>
                    <td data-label="Unidad">{row.unitName}</td>
                    <td data-label="Stock total">
                      {formatQuantity(row.totalQuantity)}
                    </td>
                    <td data-label="Almacenes">{row.warehousesWithStock}</td>
                    <td data-label="Estado">
                      <span className="status-badge" data-active={row.active}>
                        {row.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td data-label="Detalle">
                      <Link
                        className="table-link"
                        href={`/products/${row.id}` as Route}
                      >
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls
            onPage={(nextPage) => beginRequest(() => setPage(nextPage))}
            pagination={state.products.pagination}
          />
        </>
      ) : null}
    </main>
  );
}
