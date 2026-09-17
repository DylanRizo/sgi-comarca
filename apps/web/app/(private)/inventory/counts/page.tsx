'use client';
import type {
  InventoryCountSessionStatus,
  InventoryCountSessionSummary,
  PaginatedData,
  WarehouseSummary,
} from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { FormField } from '@/components/ui/form-field';
import { PaginationControls } from '@/components/inventory/pagination-controls';
import { inventoryApi } from '@/lib/http/inventory-api';
import { inventoryCountsApi } from '@/lib/http/inventory-counts-api';
import { useStockMutation } from '@/lib/inventory/use-stock-mutation';
import { useAuth } from '@/providers/auth-provider';

const labels: Record<InventoryCountSessionStatus, string> = {
  OPEN: 'En curso',
  PENDING_APPROVAL: 'Por aprobar',
  APPROVED: 'Aprobado',
  CANCELLED: 'Cancelado',
};
function managuaToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export default function InventoryCountsPage() {
  const router = useRouter(),
    { state } = useAuth(),
    mutation = useStockMutation();
  const [result, setResult] =
      useState<PaginatedData<InventoryCountSessionSummary> | null>(null),
    [warehouses, setWarehouses] = useState<readonly WarehouseSummary[]>([]);
  const [page, setPage] = useState(1),
    [status, setStatus] = useState<'' | InventoryCountSessionStatus>(''),
    [reload, setReload] = useState(0),
    [loadError, setLoadError] = useState('');
  const [businessDate, setBusinessDate] = useState(managuaToday),
    [reason, setReason] = useState(''),
    [selected, setSelected] = useState<string[]>([]);
  const permissions =
    state.kind === 'authenticated' ? state.session.permissions : [];
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      inventoryCountsApi.list(
        { page, pageSize: 25, ...(status ? { status } : {}) },
        controller.signal,
      ),
      inventoryApi.warehouses(controller.signal),
    ])
      .then(([counts, warehousePage]) => {
        if (!controller.signal.aborted) {
          setResult(counts);
          setWarehouses(warehousePage.items);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLoadError('No pudimos cargar los conteos.');
      });
    return () => controller.abort();
  }, [page, status, reload]);
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutation.execute(async (key, csrf) => {
      const created = await inventoryCountsApi.create(
        { businessDate, reason: reason.trim(), warehouseIds: selected },
        csrf,
        key,
      );
      router.push(`/inventory/counts/${created.id}` as Route);
    });
  }
  return (
    <main className="content-page" id="main-content">
      <header className="page-heading">
        <div>
          <h1>Conteo físico</h1>
          <p>
            Recorrido guiado: prepara el alcance, cuenta, revisa diferencias y
            envía a aprobación.
          </p>
        </div>
      </header>
      {permissions.includes('inventory.audit.create') ? (
        <form className="work-form" onSubmit={create}>
          <h2>1. Preparar un conteo</h2>
          <fieldset disabled={mutation.busy || mutation.uncertain}>
            <div className="form-grid">
              <FormField label="Fecha local de Managua">
                <input
                  required
                  type="date"
                  value={businessDate}
                  onChange={(event) => setBusinessDate(event.target.value)}
                />
              </FormField>
              <FormField label="Motivo">
                <input
                  required
                  maxLength={500}
                  placeholder="Conteo mensual o verificación puntual"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </FormField>
            </div>
            <fieldset className="work-panel">
              <legend>Bodegas incluidas</legend>
              {warehouses.length === 0 ? (
                <p className="check-field-status">
                  {loadError
                    ? 'No pudimos cargar las bodegas.'
                    : 'Cargando bodegas…'}
                </p>
              ) : null}
              {warehouses.map((warehouse) => (
                <label className="check-field" key={warehouse.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(warehouse.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, warehouse.id]
                          : current.filter((id) => id !== warehouse.id),
                      )
                    }
                  />
                  <span>{warehouse.name}</span>
                </label>
              ))}
            </fieldset>
          </fieldset>
          {mutation.error ? (
            <p role="alert" className="inline-error">
              {mutation.error}
            </p>
          ) : null}
          <button
            className="primary-button"
            disabled={mutation.busy || !reason.trim() || selected.length === 0}
            type="submit"
          >
            {mutation.busy
              ? 'Creando…'
              : mutation.uncertain
                ? 'Reintentar'
                : 'Crear y comenzar a contar'}
          </button>
        </form>
      ) : null}
      <section className="detail-section">
        <div className="section-heading">
          <h2>Conteos guardados</h2>
          <FormField label="Estado">
            <select
              value={status}
              onChange={(event) => {
                setStatus(
                  event.target.value as '' | InventoryCountSessionStatus,
                );
                setPage(1);
                setResult(null);
                setLoadError('');
              }}
            >
              <option value="">Todos</option>
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        {loadError ? (
          <p role="alert">
            {loadError}{' '}
            <button
              className="secondary-button"
              onClick={() => {
                setLoadError('');
                setResult(null);
                setReload((value) => value + 1);
              }}
            >
              Reintentar
            </button>
          </p>
        ) : !result ? (
          <p role="status">Cargando conteos…</p>
        ) : result.items.length === 0 ? (
          <div className="work-panel">
            <h3>
              {status
                ? `No hay conteos: ${labels[status]}`
                : 'Todavía no hay conteos'}
            </h3>
            <p>
              {status
                ? 'Cambia el filtro para consultar otros estados.'
                : 'Prepara la primera sesión para comenzar.'}
            </p>
          </div>
        ) : (
          <>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Motivo</th>
                    <th>Bodegas</th>
                    <th>Estado</th>
                    <th>Progreso</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((session) => (
                    <tr key={session.id}>
                      <td data-label="Fecha">{session.businessDate}</td>
                      <td data-label="Motivo">{session.reason}</td>
                      <td data-label="Bodegas">
                        {session.warehouses
                          .map((warehouse) => warehouse.name)
                          .join(', ')}
                      </td>
                      <td data-label="Estado">
                        <span className="status-badge">
                          {labels[session.status]}
                        </span>
                      </td>
                      <td data-label="Progreso">{session.lineCount} líneas</td>
                      <td data-label="Acción">
                        <Link
                          className="table-link"
                          href={`/inventory/counts/${session.id}` as Route}
                        >
                          {session.status === 'OPEN' ? 'Continuar' : 'Revisar'}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls
              pagination={result.pagination}
              onPage={setPage}
            />
          </>
        )}
      </section>
    </main>
  );
}
