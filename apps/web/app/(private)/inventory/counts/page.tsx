'use client';

import type {
  InventoryCountSessionSummary,
  WarehouseSummary,
} from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { inventoryApi } from '@/lib/http/inventory-api';
import { inventoryCountsApi } from '@/lib/http/inventory-counts-api';
import { useAuth } from '@/providers/auth-provider';

const statusLabels: Record<string, string> = {
  APPROVED: 'Aprobado',
  CANCELLED: 'Cancelado',
  OPEN: 'Abierto',
  PENDING_APPROVAL: 'Por aprobar',
};

const statusTones: Record<string, string> = {
  APPROVED: 'completed',
  CANCELLED: 'cancelled',
  OPEN: 'transit',
  PENDING_APPROVAL: 'transit',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function InventoryCountsPage() {
  const { getCsrfToken, state } = useAuth();
  const [sessions, setSessions] = useState<
    readonly InventoryCountSessionSummary[] | null
  >(null);
  const [warehouses, setWarehouses] = useState<readonly WarehouseSummary[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);

  const [businessDate, setBusinessDate] = useState(today());
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const scheduledLoad = window.setTimeout(() => {
      Promise.all([
        inventoryCountsApi.list({ pageSize: 25 }, controller.signal),
        inventoryApi.warehouses(controller.signal),
      ])
        .then(([page, warehousePage]) => {
          setSessions(page.items);
          setWarehouses(warehousePage.items);
        })
        .catch(() => {
          if (!controller.signal.aborted) setLoadError(true);
        });
    }, 0);
    return () => {
      window.clearTimeout(scheduledLoad);
      controller.abort();
    };
  }, [reload]);

  if (state.kind !== 'authenticated') return null;
  const canCreate = state.session.permissions.includes(
    'inventory.audit.create',
  );

  async function createSession(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const csrfToken = await getCsrfToken();
      await inventoryCountsApi.create(
        { businessDate, reason, warehouseIds: [...selected] },
        csrfToken,
        crypto.randomUUID() + crypto.randomUUID(),
      );
      setReason('');
      setSelected([]);
      setReload((current) => current + 1);
    } catch {
      setFeedback('No fue posible crear la sesión de conteo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="content-page" id="main-content">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Inventario</p>
          <h1>Conteo físico</h1>
          <p>
            Cada sesión declara las bodegas que abarca. Un producto sin conteo
            se reporta como pendiente: nunca se asume en cero.
          </p>
        </div>
      </section>

      {canCreate ? (
        <form className="sale-actions" onSubmit={createSession}>
          <h2>Nueva sesión</h2>
          <div className="sale-form-grid">
            <label>
              <span>Fecha</span>
              <input
                onChange={(event) => setBusinessDate(event.target.value)}
                required
                type="date"
                value={businessDate}
              />
            </label>
            <label>
              <span>Motivo</span>
              <input
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Conteo mensual"
                required
                type="text"
                value={reason}
              />
            </label>
          </div>
          <fieldset className="sale-lines">
            <legend>Bodegas incluidas</legend>
            {warehouses.map((warehouse) => (
              <label className="checkbox-field" key={warehouse.id}>
                <input
                  checked={selected.includes(warehouse.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, warehouse.id]
                        : current.filter((id) => id !== warehouse.id),
                    )
                  }
                  type="checkbox"
                />
                <span>
                  {warehouse.name} ({warehouse.code})
                </span>
              </label>
            ))}
          </fieldset>
          {feedback ? <p className="form-feedback">{feedback}</p> : null}
          <div className="page-actions">
            <button
              className="primary-button"
              disabled={submitting || selected.length === 0 || !reason.trim()}
              type="submit"
            >
              {submitting ? 'Creando…' : 'Crear sesión'}
            </button>
          </div>
        </form>
      ) : null}

      <section className="detail-section">
        <div className="section-heading">
          <h2>Sesiones</h2>
        </div>
        {loadError ? (
          <p className="read-state" data-tone="error">
            No fue posible cargar las sesiones de conteo.
          </p>
        ) : null}
        {sessions === null && !loadError ? (
          <p className="read-state">Cargando sesiones…</p>
        ) : null}
        {sessions && sessions.length === 0 ? (
          <p className="read-state">Todavía no hay sesiones de conteo.</p>
        ) : null}
        {sessions && sessions.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Motivo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Líneas</th>
                  <th scope="col">Creada por</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td data-label="Fecha">{session.businessDate}</td>
                    <td data-label="Motivo">{session.reason}</td>
                    <td data-label="Estado">
                      <span
                        className="status-badge"
                        data-tone={statusTones[session.status]}
                      >
                        {statusLabels[session.status] ?? session.status}
                      </span>
                    </td>
                    <td data-label="Líneas" data-numeric="true">
                      {session.lineCount}
                    </td>
                    <td data-label="Creada por">
                      {session.createdBy.displayName}
                    </td>
                    <td data-label="Acción">
                      <Link
                        className="table-link"
                        href={`/inventory/counts/${session.id}` as Route}
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
