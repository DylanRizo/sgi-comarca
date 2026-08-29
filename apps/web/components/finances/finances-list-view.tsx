'use client';

import type {
  FinanceLineSource,
  FinanceLineView,
  FinancialCategoryView,
  FinancialEntryType,
  PaginatedData,
} from '@sgi/contracts';
import Link from 'next/link';
import type { Route } from 'next';
import { type FormEvent, useEffect, useState } from 'react';

import { PaginationControls } from '@/components/inventory/pagination-controls';
import { ReadState, RetryButton } from '@/components/inventory/read-state';
import { CreateEntryDialog } from '@/components/finances/create-entry-dialog';
import { type FinanceLineQuery, financesApi } from '@/lib/http/finances-api';
import { formatMoney } from '@/lib/inventory/presentation';
import { presentReadError } from '@/lib/inventory/read-error';
import {
  entryTypeLabel,
  formatBusinessDate,
  lineSourceLabel,
} from '@/lib/finances/presentation';
import { useAuth } from '@/providers/auth-provider';

const filterableTypes = [
  'INCOME',
  'EXPENSE',
] as const satisfies readonly FinancialEntryType[];

const filterableSources = [
  'MANUAL',
  'SALE',
] as const satisfies readonly FinanceLineSource[];

interface FinancesState {
  categories: readonly FinancialCategoryView[];
  lines: PaginatedData<FinanceLineView>;
  totals: { expense: string; income: string; net: string };
}

interface FinancesDraft {
  categoryId: string;
  entryType: '' | FinancialEntryType;
  from: string;
  source: '' | FinanceLineSource;
  to: string;
}

const emptyDraft: FinancesDraft = {
  categoryId: '',
  entryType: '',
  from: '',
  source: '',
  to: '',
};

export function FinancesListView() {
  const { refreshSession, state: authState } = useAuth();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<FinancesDraft>(emptyDraft);
  const [filters, setFilters] = useState<FinanceLineQuery>({});
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<FinancesState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const scheduledLoad = window.setTimeout(() => {
      void (async () => {
        const query = { ...filters, page, pageSize: 25 };
        const lines = await financesApi.lines(query, controller.signal);
        const totals = await financesApi.totals(filters, controller.signal);
        const categories = await financesApi.categories(controller.signal);
        return { categories, lines, totals };
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
      ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
      ...(draft.entryType ? { entryType: draft.entryType } : {}),
      ...(draft.from ? { from: draft.from } : {}),
      ...(draft.source ? { source: draft.source } : {}),
      ...(draft.to ? { to: draft.to } : {}),
    });
  }

  const errorPresentation = error ? presentReadError(error) : null;
  // Hiding the control is presentation; the backend authorizes the request.
  const canCreate =
    authState.kind === 'authenticated' &&
    authState.session.permissions.includes('finances.manual.create');

  return (
    <main className="content-page" id="main-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h1>Movimientos financieros</h1>
          <p>
            Ingresos y gastos ordenados del más reciente al más antiguo. Un
            ingreso de venta se calcula al consultar y nunca se guarda como
            asiento.
          </p>
        </div>
        <div className="page-heading-actions">
          {state ? (
            <span className="result-count">
              {state.lines.pagination.totalItems} movimientos
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
              Registrar asiento
            </button>
          ) : null}
        </div>
      </header>

      {notice ? (
        <div className="form-feedback" data-tone="success" role="status">
          {notice}
        </div>
      ) : null}

      {state ? (
        <section className="totals-panel" aria-label="Totales del periodo">
          <div>
            <span className="detail-label">Ingresos</span>
            <strong>{formatMoney(state.totals.income)}</strong>
          </div>
          <div>
            <span className="detail-label">Gastos</span>
            <strong>{formatMoney(state.totals.expense)}</strong>
          </div>
          <div className="totals-total">
            <span className="detail-label">Neto</span>
            <strong>{formatMoney(state.totals.net)}</strong>
          </div>
        </section>
      ) : null}

      <form className="filter-bar movement-filters" onSubmit={submit}>
        <label className="filter-field">
          <span>Tipo</span>
          <select
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                entryType: event.target.value as '' | FinancialEntryType,
              }))
            }
            value={draft.entryType}
          >
            <option value="">Todos los tipos</option>
            {filterableTypes.map((type) => (
              <option key={type} value={type}>
                {entryTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Origen</span>
          <select
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                source: event.target.value as '' | FinanceLineSource,
              }))
            }
            value={draft.source}
          >
            <option value="">Todos los orígenes</option>
            {filterableSources.map((source) => (
              <option key={source} value={source}>
                {lineSourceLabel(source)}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Categoría</span>
          <select
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                categoryId: event.target.value,
              }))
            }
            value={draft.categoryId}
          >
            <option value="">Todas las categorías</option>
            {state?.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
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
        <ReadState title="Cargando movimientos">
          <p>Consultando finanzas…</p>
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
      ) : state?.lines.items.length === 0 ? (
        <ReadState title="Sin movimientos">
          <p>No hay movimientos que coincidan con los filtros.</p>
        </ReadState>
      ) : state ? (
        <>
          <div className="data-table-wrap">
            <table className="data-table finance-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Origen</th>
                  <th>Categoría</th>
                  <th>Descripción</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {state.lines.items.map((line) => (
                  <tr key={`${line.source}-${line.id}`}>
                    <td data-label="Fecha">
                      {formatBusinessDate(line.businessDate)}
                    </td>
                    <td data-label="Tipo">
                      <span
                        className="status-badge"
                        data-tone={
                          line.entryType === 'INCOME'
                            ? 'completed'
                            : 'cancelled'
                        }
                      >
                        {entryTypeLabel(line.entryType)}
                      </span>
                    </td>
                    <td data-label="Origen">
                      {line.source === 'SALE' && line.saleId ? (
                        <Link
                          href={`/sales/${line.saleId}` as Route}
                          aria-label={`Ver venta ${line.saleNumber ?? ''}`}
                        >
                          {line.saleNumber}
                        </Link>
                      ) : (
                        lineSourceLabel(line.source)
                      )}
                    </td>
                    <td data-label="Categoría">
                      {line.category?.name ?? 'Sin categoría'}
                    </td>
                    <td data-label="Descripción">{line.description ?? '—'}</td>
                    <td data-label="Monto">
                      <strong>
                        {formatMoney(line.amount, line.currencyCode)}
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
            pagination={state.lines.pagination}
          />
        </>
      ) : null}

      {creating ? (
        <CreateEntryDialog
          onCancel={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false);
            setNotice('Asiento registrado.');
            setLoading(true);
            setPage(1);
            setReload((value) => value + 1);
          }}
        />
      ) : null}
    </main>
  );
}
