'use client';

import { useEffect, useState } from 'react';

import { publicApiUrl } from '@/lib/environment';
import { apiRequest } from '@/lib/http/api-client';
import { inventoryQueryString } from '@/lib/inventory/query';
import { useAuth } from '@/providers/auth-provider';

interface ReportDefinition {
  columns: readonly { key: string; label: string; numeric?: boolean }[];
  description: string;
  label: string;
  path: string;
  permissions: readonly string[];
}

/**
 * The four FASE 9B.2 reports. `permissions` mirrors what the backend requires:
 * hiding a tab the actor cannot use is presentation, and the API refuses the
 * request regardless.
 */
const reports: readonly ReportDefinition[] = [
  {
    columns: [
      { key: 'productCode', label: 'Código' },
      { key: 'productName', label: 'Producto' },
      { key: 'warehouseName', label: 'Bodega' },
      { key: 'quantity', label: 'Cantidad', numeric: true },
      { key: 'unitCost', label: 'Costo', numeric: true },
      { key: 'stockValue', label: 'Valor', numeric: true },
    ],
    description: 'Saldos por producto y bodega.',
    label: 'Inventario',
    path: 'inventory',
    permissions: ['reports.read', 'inventory.read'],
  },
  {
    columns: [
      { key: 'occurredAt', label: 'Fecha' },
      { key: 'type', label: 'Tipo' },
      { key: 'productCode', label: 'Producto' },
      { key: 'warehouseName', label: 'Bodega' },
      { key: 'quantityDelta', label: 'Delta', numeric: true },
      { key: 'balanceAfter', label: 'Saldo', numeric: true },
    ],
    description: 'Movimientos del libro de inventario.',
    label: 'Movimientos',
    path: 'movements',
    permissions: ['reports.read', 'inventory.read'],
  },
  {
    columns: [
      { key: 'saleNumber', label: 'Venta' },
      { key: 'businessDate', label: 'Fecha' },
      { key: 'status', label: 'Estado' },
      { key: 'itemCount', label: 'Líneas', numeric: true },
      { key: 'total', label: 'Total', numeric: true },
    ],
    description: 'Ventas con sus totales.',
    label: 'Ventas',
    path: 'sales',
    permissions: ['reports.read', 'sales.read'],
  },
  {
    columns: [
      { key: 'businessDate', label: 'Fecha' },
      { key: 'entryType', label: 'Tipo' },
      { key: 'categoryName', label: 'Categoría' },
      { key: 'amount', label: 'Monto', numeric: true },
      { key: 'description', label: 'Descripción' },
    ],
    description: 'Asientos financieros registrados.',
    label: 'Finanzas',
    path: 'finances',
    permissions: ['reports.read', 'finances.read'],
  },
];

type Row = Record<string, unknown>;

interface ReportPage {
  items: readonly Row[];
  pagination: { page: number; totalItems: number; totalPages: number };
}

type LoadState =
  | { kind: 'error' }
  | { kind: 'loading' }
  | {
      kind: 'ready';
      items: readonly Row[];
      pagination: { page: number; totalItems: number; totalPages: number };
    };

export default function ReportsPage() {
  const { state } = useAuth();
  const [active, setActive] = useState(0);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [result, setResult] = useState<LoadState>({ kind: 'loading' });
  const [applied, setApplied] = useState({ from: '', to: '' });

  const permissions =
    state.kind === 'authenticated' ? state.session.permissions : [];
  const available = reports.filter((report) =>
    report.permissions.every((permission) => permissions.includes(permission)),
  );
  const definition = available[active];

  const path = definition?.path;

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    const scheduledLoad = window.setTimeout(() => {
      const query = inventoryQueryString({
        from: applied.from,
        page,
        pageSize: 25,
        to: applied.to,
      });
      apiRequest<ReportPage>(`/api/v1/reports/${path}${query}`, {
        signal: controller.signal,
      })
        .then((data) =>
          setResult({
            items: data.items,
            kind: 'ready',
            pagination: data.pagination,
          }),
        )
        .catch(() => {
          if (!controller.signal.aborted) setResult({ kind: 'error' });
        });
    }, 0);
    return () => {
      window.clearTimeout(scheduledLoad);
      controller.abort();
    };
  }, [applied, page, path]);

  if (state.kind !== 'authenticated') return null;

  if (!definition) {
    return (
      <main className="content-page" id="main-content">
        <p className="read-state" data-tone="warning">
          Tu cuenta no tiene acceso a ningún reporte.
        </p>
      </main>
    );
  }

  // The export link points at the same query the table is showing, so what is
  // downloaded is exactly what is on screen.
  const exportHref = `${publicApiUrl()}/api/v1/reports/${definition.path}${inventoryQueryString(
    {
      format: 'csv',
      from: applied.from,
      page,
      pageSize: 25,
      to: applied.to,
    },
  )}`;

  return (
    <main className="content-page" id="main-content">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Reportes</p>
          <h1>{definition.label}</h1>
          <p>{definition.description}</p>
        </div>
        <div className="page-heading-actions">
          <a className="secondary-link" href={exportHref}>
            Exportar CSV
          </a>
        </div>
      </section>

      <nav aria-label="Reportes disponibles" className="page-actions">
        {available.map((report, index) => (
          <button
            className={index === active ? 'primary-button' : 'secondary-button'}
            key={report.path}
            onClick={() => {
              setResult({ kind: 'loading' });
              setActive(index);
              setPage(1);
            }}
            type="button"
          >
            {report.label}
          </button>
        ))}
      </nav>

      <form
        className="filter-bar"
        onSubmit={(event) => {
          event.preventDefault();
          setResult({ kind: 'loading' });
          setPage(1);
          setApplied({ from, to });
        }}
      >
        <label className="filter-field">
          <span>Desde</span>
          <input
            onChange={(event) => setFrom(event.target.value)}
            type="date"
            value={from}
          />
        </label>
        <label className="filter-field">
          <span>Hasta</span>
          <input
            onChange={(event) => setTo(event.target.value)}
            type="date"
            value={to}
          />
        </label>
        <button className="primary-button" type="submit">
          Filtrar
        </button>
      </form>

      {result.kind === 'loading' ? (
        <p className="read-state">Cargando el reporte…</p>
      ) : null}

      {result.kind === 'error' ? (
        <p className="read-state" data-tone="error">
          No fue posible cargar el reporte.
        </p>
      ) : null}

      {result.kind === 'ready' ? (
        <>
          <p className="result-count">
            {result.pagination.totalItems} resultados
          </p>
          {result.items.length === 0 ? (
            <p className="read-state">Sin datos para el filtro aplicado.</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {definition.columns.map((column) => (
                      <th key={column.key} scope="col">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((row, index) => (
                    <tr key={index}>
                      {definition.columns.map((column) => (
                        <td
                          data-label={column.label}
                          data-numeric={column.numeric ? 'true' : undefined}
                          key={column.key}
                        >
                          {row[column.key] === null ||
                          row[column.key] === undefined
                            ? '—'
                            : String(row[column.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination-controls">
            <button
              className="secondary-button"
              disabled={result.pagination.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              Anterior
            </button>
            <span>
              Página {result.pagination.page} de{' '}
              {Math.max(1, result.pagination.totalPages)}
            </span>
            <button
              className="secondary-button"
              disabled={result.pagination.page >= result.pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
              type="button"
            >
              Siguiente
            </button>
          </div>
        </>
      ) : null}
    </main>
  );
}
