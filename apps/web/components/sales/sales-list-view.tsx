'use client';

import type {
  PaginatedData,
  SalePaymentStatus,
  SaleStatus,
  SaleView,
  WarehouseSummary,
} from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { PaginationControls } from '@/components/inventory/pagination-controls';
import { ReadState, RetryButton } from '@/components/inventory/read-state';
import { inventoryApi } from '@/lib/http/inventory-api';
import { presentReadError } from '@/lib/http/read-error';
import { type SalesQuery, salesApi } from '@/lib/http/sales-api';
import {
  formatBusinessDate,
  formatSaleMoney,
  salePaymentStatusLabel,
  salePaymentStatusTone,
  saleStatusLabel,
  saleStatusTone,
  saleWarehouseCodes,
} from '@/lib/sales/presentation';
import { useAuth } from '@/providers/auth-provider';

// `LEGACY_UNKNOWN` is never offered: it only exists for imported sales, and no
// legacy sale has been materialized yet.
const filterableStatuses = [
  'IN_TRANSIT',
  'COMPLETED',
  'CANCELLED',
] as const satisfies readonly SaleStatus[];

const filterablePaymentStatuses = [
  'PENDING',
  'PAID',
  'UNKNOWN',
] as const satisfies readonly SalePaymentStatus[];

interface SalesDraft {
  from: string;
  paymentStatus: '' | SalePaymentStatus;
  status: '' | SaleStatus;
  to: string;
  warehouseId: string;
}

const emptyDraft: SalesDraft = {
  from: '',
  paymentStatus: '',
  status: '',
  to: '',
  warehouseId: '',
};

interface WarehouseOption {
  code: string;
  id: string;
  name: string;
}

/**
 * The warehouse catalog is guarded by `inventory.read`, which a `SALES` account
 * does not hold. Rather than issue a request that can only be refused, the
 * catalog is requested solely when the session already carries that permission;
 * otherwise the filter is populated from the warehouses present in the loaded
 * sales. Either way the server decides what the query may return.
 */
function warehouseOptions(
  catalog: readonly WarehouseSummary[] | null,
  sales: readonly SaleView[],
): readonly WarehouseOption[] {
  if (catalog) return catalog;
  const observed = new Map<string, WarehouseOption>();
  for (const sale of sales) {
    for (const item of sale.items) {
      observed.set(item.warehouse.id, item.warehouse);
    }
  }
  return [...observed.values()].sort((left, right) =>
    left.name.localeCompare(right.name, 'es'),
  );
}

export function SalesListView() {
  const { refreshSession, state: session } = useAuth();
  const canReadInventory =
    session.kind === 'authenticated' &&
    session.session.permissions.includes('inventory.read');

  const [catalog, setCatalog] = useState<readonly WarehouseSummary[] | null>(
    null,
  );
  const [draft, setDraft] = useState<SalesDraft>(emptyDraft);
  const [error, setError] = useState<unknown>(null);
  const [filters, setFilters] = useState<SalesQuery>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [sales, setSales] = useState<PaginatedData<SaleView> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const scheduledLoad = window.setTimeout(() => {
      void salesApi
        .list({ ...filters, page, pageSize: 25 }, controller.signal)
        .then((result) => {
          setError(null);
          setSales(result);
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

  useEffect(() => {
    if (!canReadInventory) return;
    const controller = new AbortController();
    // A failed catalog read must never hide the sales the user may read.
    void inventoryApi
      .warehouses(controller.signal)
      .then((result) => setCatalog(result.items))
      .catch(() => undefined);
    return () => controller.abort();
  }, [canReadInventory]);

  const warehouses = useMemo(
    () => warehouseOptions(catalog, sales?.items ?? []),
    [catalog, sales],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setPage(1);
    setFilters({
      ...(draft.from ? { from: draft.from } : {}),
      ...(draft.paymentStatus ? { paymentStatus: draft.paymentStatus } : {}),
      ...(draft.status ? { status: draft.status } : {}),
      ...(draft.to ? { to: draft.to } : {}),
      ...(draft.warehouseId ? { warehouseId: draft.warehouseId } : {}),
    });
  }

  const errorPresentation = error
    ? presentReadError(error, 'sales.read')
    : null;

  return (
    <main className="content-page" id="main-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Ventas</p>
          <h1>Ventas registradas</h1>
          <p>
            Entrega y pago son estados independientes: una venta entregada puede
            seguir pendiente de pago.
          </p>
        </div>
        {sales ? (
          <span className="result-count">
            {sales.pagination.totalItems} ventas
          </span>
        ) : null}
      </header>

      <form className="filter-bar sales-filters" onSubmit={submit}>
        <label className="filter-field">
          <span>Entrega</span>
          <select
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                status: event.target.value as '' | SaleStatus,
              }))
            }
            value={draft.status}
          >
            <option value="">Toda entrega</option>
            {filterableStatuses.map((status) => (
              <option key={status} value={status}>
                {saleStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Pago</span>
          <select
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                paymentStatus: event.target.value as '' | SalePaymentStatus,
              }))
            }
            value={draft.paymentStatus}
          >
            <option value="">Todo pago</option>
            {filterablePaymentStatuses.map((status) => (
              <option key={status} value={status}>
                {salePaymentStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Almacén</span>
          <select
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                warehouseId: event.target.value,
              }))
            }
            value={draft.warehouseId}
          >
            <option value="">Todos los almacenes</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name} ({warehouse.code})
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Desde</span>
          <input
            onChange={(event) =>
              setDraft((current) => ({ ...current, from: event.target.value }))
            }
            type="date"
            value={draft.from}
          />
        </label>
        <label className="filter-field">
          <span>Hasta</span>
          <input
            onChange={(event) =>
              setDraft((current) => ({ ...current, to: event.target.value }))
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
        <ReadState title="Cargando ventas">
          <p>Consultando las ventas registradas…</p>
        </ReadState>
      ) : errorPresentation ? (
        <ReadState
          action={
            <RetryButton
              onRetry={() => {
                setError(null);
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
      ) : sales?.items.length === 0 ? (
        <ReadState title="Sin ventas">
          <p>No hay ventas que coincidan con los filtros aplicados.</p>
        </ReadState>
      ) : sales ? (
        <>
          <div className="data-table-wrap">
            <table className="data-table sales-table">
              <thead>
                <tr>
                  <th>Venta</th>
                  <th>Fecha</th>
                  <th>Entrega</th>
                  <th>Pago</th>
                  <th>Almacenes</th>
                  <th>Líneas</th>
                  <th>Total</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {sales.items.map((sale) => (
                  <tr key={sale.id}>
                    <td data-label="Venta">
                      <strong>{sale.saleNumber}</strong>
                    </td>
                    <td data-label="Fecha">
                      {formatBusinessDate(sale.businessDate)}
                    </td>
                    <td data-label="Entrega">
                      <span
                        className="status-badge"
                        data-tone={saleStatusTone(sale.status)}
                      >
                        {saleStatusLabel(sale.status)}
                      </span>
                    </td>
                    <td data-label="Pago">
                      <span
                        className="status-badge"
                        data-tone={salePaymentStatusTone(sale.paymentStatus)}
                      >
                        {salePaymentStatusLabel(sale.paymentStatus)}
                      </span>
                    </td>
                    <td data-label="Almacenes">
                      {saleWarehouseCodes(sale.items).join(' · ')}
                    </td>
                    <td data-label="Líneas">{sale.items.length}</td>
                    <td data-label="Total">
                      <strong>
                        {formatSaleMoney(sale.total, sale.currencyCode)}
                      </strong>
                    </td>
                    <td data-label="Detalle">
                      <Link
                        className="table-link"
                        href={`/sales/${sale.id}` as Route}
                      >
                        Ver venta
                      </Link>
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
            pagination={sales.pagination}
          />
        </>
      ) : null}
    </main>
  );
}
