'use client';

import type {
  DailyClosingStatus,
  DailyClosingView,
  PaginatedData,
} from '@sgi/contracts';
import Link from 'next/link';
import type { Route } from 'next';
import { type FormEvent, useEffect, useState } from 'react';

import { PaginationControls } from '@/components/inventory/pagination-controls';
import { ReadState, RetryButton } from '@/components/inventory/read-state';
import { CreateClosingDialog } from '@/components/finances/create-closing-dialog';
import { type DailyClosingQuery, closingsApi } from '@/lib/http/finances-api';
import { formatMoney } from '@/lib/inventory/presentation';
import { presentReadError } from '@/lib/inventory/read-error';
import {
  closingStatusLabel,
  closingStatusTone,
  formatBusinessDate,
} from '@/lib/finances/presentation';
import { useAuth } from '@/providers/auth-provider';

const filterableStatuses = [
  'CLOSED',
  'REOPENED',
] as const satisfies readonly DailyClosingStatus[];

interface ClosingsDraft {
  from: string;
  status: '' | DailyClosingStatus;
  to: string;
}

const emptyDraft: ClosingsDraft = { from: '', status: '', to: '' };

export function ClosingsListView() {
  const { refreshSession, state: authState } = useAuth();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<ClosingsDraft>(emptyDraft);
  const [filters, setFilters] = useState<DailyClosingQuery>({});
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [closings, setClosings] =
    useState<PaginatedData<DailyClosingView> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const scheduledLoad = window.setTimeout(() => {
      closingsApi
        .closings({ ...filters, page, pageSize: 25 }, controller.signal)
        .then((loaded) => {
          setError(null);
          setClosings(loaded);
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
      ...(draft.status ? { status: draft.status } : {}),
      ...(draft.to ? { to: draft.to } : {}),
    });
  }

  const errorPresentation = error ? presentReadError(error) : null;
  const canCreate =
    authState.kind === 'authenticated' &&
    authState.session.permissions.includes('closings.create');

  return (
    <main className="content-page" id="main-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h1>Cierres diarios</h1>
          <p>
            Un cierre por fecha. Las ventas en tránsito de ese día quedan
            reportadas, nunca canceladas por el cierre.
          </p>
        </div>
        <div className="page-heading-actions">
          {closings ? (
            <span className="result-count">
              {closings.pagination.totalItems} cierres
            </span>
          ) : null}
          {canCreate ? (
            <button
              className="primary-button"
              onClick={() => {
                setNotice(null);
                setCreating(true);
              }}
              type="button"
            >
              Crear cierre
            </button>
          ) : null}
        </div>
      </header>

      {notice ? (
        <div className="form-feedback" data-tone="success" role="status">
          {notice}
        </div>
      ) : null}

      <form className="filter-bar movement-filters" onSubmit={submit}>
        <label className="filter-field">
          <span>Estado</span>
          <select
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                status: event.target.value as '' | DailyClosingStatus,
              }))
            }
            value={draft.status}
          >
            <option value="">Todos los estados</option>
            {filterableStatuses.map((status) => (
              <option key={status} value={status}>
                {closingStatusLabel(status)}
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
        <ReadState title="Cargando cierres">
          <p>Consultando cierres diarios…</p>
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
      ) : closings?.items.length === 0 ? (
        <ReadState title="Sin cierres">
          <p>No hay cierres que coincidan con los filtros.</p>
        </ReadState>
      ) : closings ? (
        <>
          <div className="data-table-wrap">
            <table className="data-table closings-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Cuadre</th>
                  <th>Ventas del sistema</th>
                  <th>Diferencia</th>
                  <th>En tránsito</th>
                </tr>
              </thead>
              <tbody>
                {closings.items.map((closing) => (
                  <tr key={closing.id}>
                    <td data-label="Fecha">
                      <Link
                        href={`/closings/${closing.id}` as Route}
                        aria-label={`Ver cierre del ${closing.businessDate}`}
                      >
                        <strong>
                          {formatBusinessDate(closing.businessDate)}
                        </strong>
                      </Link>
                    </td>
                    <td data-label="Estado">
                      <span
                        className="status-badge"
                        data-tone={closingStatusTone(closing.status)}
                      >
                        {closingStatusLabel(closing.status)}
                      </span>
                    </td>
                    <td data-label="Cuadre">
                      {closing.balanced ? 'Cuadrado' : 'Descuadrado'}
                    </td>
                    <td data-label="Ventas del sistema">
                      {formatMoney(closing.systemSales, closing.currencyCode)}
                    </td>
                    <td data-label="Diferencia">
                      {formatMoney(closing.difference, closing.currencyCode)}
                    </td>
                    <td data-label="En tránsito">
                      {closing.inTransitSaleCount}
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
            pagination={closings.pagination}
          />
        </>
      ) : null}

      {creating ? (
        <CreateClosingDialog
          onCancel={() => setCreating(false)}
          onSuccess={(closing) => {
            setCreating(false);
            setNotice(
              'Cierre del ' +
                formatBusinessDate(closing.businessDate) +
                ' registrado.',
            );
            setLoading(true);
            setPage(1);
            setReload((value) => value + 1);
          }}
        />
      ) : null}
    </main>
  );
}
