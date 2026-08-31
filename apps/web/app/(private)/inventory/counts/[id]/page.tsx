'use client';

import type { InventoryCountSessionView, ProductSummary } from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';

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

function sign(difference: string): 'negative' | 'positive' | 'zero' {
  const value = Number(difference);
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'zero';
}

export default function InventoryCountDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  const { getCsrfToken, state } = useAuth();
  const [session, setSession] = useState<InventoryCountSessionView | null>(
    null,
  );
  const [products, setProducts] = useState<readonly ProductSummary[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);

  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [countedQuantity, setCountedQuantity] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    text: string;
    tone: 'error' | 'success';
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const scheduledLoad = window.setTimeout(() => {
      Promise.all([
        inventoryCountsApi.detail(id, controller.signal),
        inventoryApi.products({ page: 1, pageSize: 100 }, controller.signal),
      ])
        .then(([detail, productPage]) => {
          setSession(detail);
          setProducts(productPage.items);
        })
        .catch(() => {
          if (!controller.signal.aborted) setLoadError(true);
        });
    }, 0);
    return () => {
      window.clearTimeout(scheduledLoad);
      controller.abort();
    };
  }, [id, reload]);

  if (state.kind !== 'authenticated') return null;
  const permissions = state.session.permissions;
  const canCapture = permissions.includes('inventory.audit.create');
  const canApprove = permissions.includes('inventory.audit.approve');

  async function run(
    action: (csrfToken: string) => Promise<unknown>,
    success: string,
    failure: string,
  ) {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const csrfToken = await getCsrfToken();
      await action(csrfToken);
      setFeedback({ text: success, tone: 'success' });
      setReload((current) => current + 1);
    } catch {
      setFeedback({ text: failure, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="content-page" id="main-content">
        <p className="read-state" data-tone="error">
          No fue posible cargar la sesión de conteo.
        </p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="content-page" id="main-content">
        <p className="read-state">Cargando la sesión…</p>
      </main>
    );
  }

  const isOpen = session.status === 'OPEN';
  const isPending = session.status === 'PENDING_APPROVAL';

  return (
    <main className="content-page" id="main-content">
      <section className="page-heading">
        <div>
          <Link className="back-link" href={'/inventory/counts' as Route}>
            ← Conteos
          </Link>
          <h1>Conteo del {session.businessDate}</h1>
          <p>{session.reason}</p>
        </div>
        <span className="status-badge" data-tone={statusTones[session.status]}>
          {statusLabels[session.status] ?? session.status}
        </span>
      </section>

      {feedback ? (
        <p className="form-feedback" data-tone={feedback.tone}>
          {feedback.text}
        </p>
      ) : null}

      <dl className="detail-grid">
        <div>
          <span className="detail-label">Creada por</span>
          <strong>{session.createdBy.displayName}</strong>
        </div>
        <div>
          <span className="detail-label">Bodegas</span>
          <strong>
            {session.warehouses.map((warehouse) => warehouse.code).join(', ')}
          </strong>
        </div>
        <div>
          <span className="detail-label">Aprobada por</span>
          <strong>{session.approvedBy?.displayName ?? '—'}</strong>
        </div>
        {session.cancellationReason ? (
          <div>
            <span className="detail-label">Motivo de cancelación</span>
            <strong>{session.cancellationReason}</strong>
          </div>
        ) : null}
      </dl>

      {canCapture && isOpen ? (
        <form
          className="sale-actions"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              (csrfToken) =>
                inventoryCountsApi.captureLine(
                  id,
                  { countedQuantity, productId, warehouseId },
                  csrfToken,
                ),
              'Conteo registrado.',
              'No fue posible registrar el conteo.',
            ).then(() => setCountedQuantity(''));
          }}
        >
          <h2>Registrar conteo</h2>
          <div className="sale-form-grid">
            <label>
              <span>Producto</span>
              <select
                onChange={(event) => setProductId(event.target.value)}
                required
                value={productId}
              >
                <option value="">Selecciona…</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.code} — {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Bodega</span>
              <select
                onChange={(event) => setWarehouseId(event.target.value)}
                required
                value={warehouseId}
              >
                <option value="">Selecciona…</option>
                {session.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Cantidad contada</span>
              <input
                inputMode="decimal"
                onChange={(event) => setCountedQuantity(event.target.value)}
                placeholder="0.0000"
                required
                type="text"
                value={countedQuantity}
              />
            </label>
          </div>
          <p className="sale-actions-hint">
            Una línea registrada no se edita. Para corregir un error hay que
            cancelar la sesión y empezar otra.
          </p>
          <div className="page-actions">
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? 'Guardando…' : 'Registrar'}
            </button>
          </div>
        </form>
      ) : null}

      <section className="detail-section">
        <div className="section-heading">
          <h2>Líneas contadas</h2>
        </div>
        {session.lines.length === 0 ? (
          <p className="read-state">Todavía no hay conteos registrados.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Bodega</th>
                  <th scope="col">Esperado</th>
                  <th scope="col">Contado</th>
                  <th scope="col">Diferencia</th>
                  <th scope="col">Ajuste</th>
                </tr>
              </thead>
              <tbody>
                {session.lines.map((line) => (
                  <tr key={line.id}>
                    <td data-label="Producto">
                      {line.product.code}
                      <span>{line.product.name}</span>
                    </td>
                    <td data-label="Bodega">{line.warehouse.name}</td>
                    <td data-label="Esperado" data-numeric="true">
                      {line.expectedQuantity}
                    </td>
                    <td data-label="Contado" data-numeric="true">
                      {line.countedQuantity}
                    </td>
                    <td data-label="Diferencia" data-numeric="true">
                      <span
                        className="difference"
                        data-sign={sign(line.difference)}
                      >
                        {line.difference}
                      </span>
                    </td>
                    <td data-label="Ajuste">
                      {line.adjustmentMovementId ? 'Generado' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/*
        AT-AUD-02: a product in scope that was never counted is reported here
        rather than silently treated as zero, which would generate an
        adjustment nobody counted.
      */}
      {session.pendingItems.length > 0 ? (
        <section className="detail-section">
          <div className="section-heading">
            <h2>Pendientes de contar</h2>
          </div>
          <p className="read-state" data-tone="warning">
            {session.pendingItems.length} producto(s) del alcance todavía sin
            conteo. Su saldo se conserva y no genera ajuste.
          </p>
        </section>
      ) : null}

      <section className="sale-actions">
        <h2>Acciones</h2>
        <div className="page-actions">
          {canCapture && isOpen ? (
            <button
              className="primary-button"
              disabled={busy || session.lines.length === 0}
              onClick={() =>
                void run(
                  (csrfToken) => inventoryCountsApi.submit(id, csrfToken),
                  'Sesión enviada a aprobación.',
                  'No fue posible enviar la sesión.',
                )
              }
              type="button"
            >
              Enviar a aprobación
            </button>
          ) : null}
          {canApprove && isPending ? (
            <button
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void run(
                  (csrfToken) => inventoryCountsApi.approve(id, csrfToken),
                  'Conteo aprobado y ajustes generados.',
                  'No fue posible aprobar el conteo.',
                )
              }
              type="button"
            >
              Aprobar y ajustar
            </button>
          ) : null}
        </div>
        {(isOpen || isPending) && (canCapture || canApprove) ? (
          <div className="sale-cancel-panel">
            <label>
              <span>Motivo de cancelación</span>
              <input
                maxLength={500}
                onChange={(event) => setCancelReason(event.target.value)}
                type="text"
                value={cancelReason}
              />
            </label>
            <button
              className="danger-button"
              disabled={busy || !cancelReason.trim()}
              onClick={() =>
                void run(
                  (csrfToken) =>
                    inventoryCountsApi.cancel(
                      id,
                      { reason: cancelReason },
                      csrfToken,
                    ),
                  'Sesión cancelada.',
                  'No fue posible cancelar la sesión.',
                )
              }
              type="button"
            >
              Cancelar sesión
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
