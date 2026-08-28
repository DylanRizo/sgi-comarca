'use client';

import type {
  PaginatedData,
  SalePaymentStatus,
  SaleStatus,
  SaleView,
  WarehouseSummary,
} from '@sgi/contracts';
import Link from 'next/link';
import type { Route } from 'next';
import { type FormEvent, useEffect, useState } from 'react';

import { PaginationControls } from '@/components/inventory/pagination-controls';
import { ReadState, RetryButton } from '@/components/inventory/read-state';
import { inventoryApi } from '@/lib/http/inventory-api';
import { type SalesQuery, salesApi } from '@/lib/http/sales-api';
import { formatMoney } from '@/lib/inventory/presentation';
import { presentReadError } from '@/lib/inventory/read-error';
import {
  formatBusinessDate,
  paymentStatusLabel,
  saleStatusLabel,
  saleStatusTone,
  saleWarehouseNames,
} from '@/lib/sales/presentation';
import { useAuth } from '@/providers/auth-provider';

const filterableStatuses = [
  'IN_TRANSIT',
  'COMPLETED',
  'CANCELLED',
] as const satisfies readonly SaleStatus[];

const filterablePaymentStatuses = [
  'PENDING',
  'PAID',
] as const satisfies readonly SalePaymentStatus[];

interface SalesState {
  sales: PaginatedData<SaleView>;
  warehouses: readonly WarehouseSummary[];
}

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

export function SalesListView() {
  const { refreshSession } = useAuth();
  const [draft, setDraft] = useState<SalesDraft>(emptyDraft);
  const [filters, setFilters] = useState<SalesQuery>({});
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<SalesState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const scheduledLoad = window.setTimeout(() => {
      void (async () => {
        const sales = await salesApi.sales(
          { ...filters, page, pageSize: 25 },
          controller.signal,
        );
        const warehouses = await inventoryApi.warehouses(controller.signal);
        return { sales, warehouses: warehouses.items };
      })()
        .then((loaded) => {
          setError(null);
          setState(loaded);
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
      ...(draft.paymentStatus ? { paymentStatus: draft.paymentStatus } : {}),
      ...(draft.status ? { status: draft.status } : {}),
      ...(draft.to ? { to: draft.to } : {}),
      ...(draft.warehouseId ? { warehouseId: draft.warehouseId } : {}),
    });
  }

  const errorPresentation = error ? presentReadError(error) : null;

  return (
    <main className="content-page" id="main-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Ventas</p>
          <h1>Ventas registradas</h1>
          <p>
            Ventas operacionales ordenadas de la más reciente a la más antigua.
            La entrega y el pago son estados independientes.
          </p>
        </div>
        {state ? (
          <span className="result-count">
            {state.sales.pagination.totalItems} ventas
          </span>
        ) : null}
      </header>

      <form className="filter-bar movement-filters" onSubmit={submit}>
        <label className="filter-field">
          <span>Estado de entrega</span>
          <select
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                status: event.target.value as '' | SaleStatus,
              }))
            }
            value={draft.status}
          >
            <option value="">Todos los estados</option>
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
            <option value="">Todos los pagos</option>
            {filterablePaymentStatuses.map((status) => (
              <option key={status} value={status}>
                {paymentStatusLabel(status)}
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
            {state?.warehouses.map((warehouse) => (
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
      ) : state?.sales.items.length === 0 ? (
        <ReadState title="Sin ventas">
          <p>No hay ventas que coincidan con los filtros.</p>
        </ReadState>
      ) : state ? (
        <>
          <div className="data-table-wrap">
            <table className="data-table sales-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Fecha</th>
                  <th>Entrega</th>
                  <th>Pago</th>
                  <th>Líneas</th>
                  <th>Almacenes</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {state.sales.items.map((sale) => (
                  <tr key={sale.id}>
                    <td data-label="Número">
                      <Link
                        href={`/sales/${sale.id}` as Route}
                        aria-label={`Ver detalle de la venta ${sale.saleNumber}`}
                      >
                        <strong>{sale.saleNumber}</strong>
                      </Link>
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
                      {paymentStatusLabel(sale.paymentStatus)}
                    </td>
                    <td data-label="Líneas">{sale.items.length}</td>
                    <td data-label="Almacenes">
                      {saleWarehouseNames(sale).join(', ') || 'Sin almacén'}
                    </td>
                    <td data-label="Total">
                      <strong>
                        {formatMoney(sale.total, sale.currencyCode)}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls
            onPage={(next) => {
              setLoading(true);
              setPage(next);
            }}
            pagination={state.sales.pagination}
          />
        </>
      ) : null}
    </main>
  );
}
