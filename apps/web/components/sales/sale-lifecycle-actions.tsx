'use client';

import type { SaleView } from '@sgi/contracts';
import { useRef, useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { salesApi } from '@/lib/http/sales-api';
import { canCancel, canConfirm } from '@/lib/sales/presentation';
import { useAuth } from '@/providers/auth-provider';

function lifecycleError(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'SALE_INVALID_STATE') {
      return 'La venta ya cambió de estado. Actualiza la página para ver su estado real.';
    }
    if (error.code === 'IDEMPOTENCY_KEY_REUSED') {
      return 'La intención cambió durante el envío. Vuelve a intentarlo.';
    }
    if (error.status === 401) return 'La sesión ya no es válida.';
    if (error.status === 403) return 'No tienes permiso para esta acción.';
    if (error.status === 404) return 'La venta ya no está disponible.';
    if (error.status === 409) {
      return 'La operación entró en conflicto con otro cambio. Actualiza la página.';
    }
  }
  return 'No fue posible completar la acción. No se reintentará automáticamente.';
}

export function SaleLifecycleActions({
  onUpdated,
  sale,
}: Readonly<{
  onUpdated: (sale: SaleView) => void;
  sale: SaleView;
}>) {
  const { getCsrfToken, state } = useAuth();
  const submissionRef = useRef(false);
  const confirmKeyRef = useRef(crypto.randomUUID());
  const cancelKeyRef = useRef(crypto.randomUUID());
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Controls are hidden by permission, but the backend authorizes every call.
  const permissions =
    state.kind === 'authenticated' ? state.session.permissions : [];
  const mayConfirm =
    permissions.includes('sales.confirm_in_transit') && canConfirm(sale);
  const mayCancel = permissions.includes('sales.cancel') && canCancel(sale);

  if (!mayConfirm && !mayCancel) return null;

  async function run(action: () => Promise<SaleView>) {
    if (submissionRef.current) return;
    submissionRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      onUpdated(await action());
      confirmKeyRef.current = crypto.randomUUID();
      cancelKeyRef.current = crypto.randomUUID();
      setCancelling(false);
      setReason('');
    } catch (actionError) {
      setError(lifecycleError(actionError));
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="sale-actions" aria-label="Acciones de la venta">
      {error ? (
        <div className="form-feedback" data-tone="error" role="alert">
          {error}
        </div>
      ) : null}

      {cancelling ? (
        <div className="sale-cancel-panel">
          <p>
            Cancelar es total y devuelve el inventario a cada almacén de origen.
            No se puede deshacer.
          </p>
          <label>
            <span>Motivo</span>
            <input
              maxLength={500}
              onChange={(event) => {
                setReason(event.target.value);
                setError(null);
              }}
              placeholder="Explica por qué se cancela"
              value={reason}
            />
          </label>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setCancelling(false);
                setReason('');
                setError(null);
              }}
              type="button"
            >
              Volver
            </button>
            <button
              className="danger-button"
              disabled={submitting || reason.trim().length === 0}
              onClick={() =>
                void run(async () =>
                  salesApi.cancel(
                    sale.id,
                    reason.trim(),
                    await getCsrfToken(),
                    cancelKeyRef.current,
                  ),
                )
              }
              type="button"
            >
              {submitting ? 'Cancelando…' : 'Confirmar cancelación'}
            </button>
          </div>
        </div>
      ) : (
        <div className="dialog-actions">
          {mayConfirm ? (
            <button
              className="primary-button"
              disabled={submitting}
              onClick={() =>
                void run(async () =>
                  salesApi.confirmInTransit(
                    sale.id,
                    await getCsrfToken(),
                    confirmKeyRef.current,
                  ),
                )
              }
              type="button"
            >
              {submitting ? 'Confirmando…' : 'Confirmar entrega'}
            </button>
          ) : null}
          {mayCancel ? (
            <button
              className="secondary-button"
              disabled={submitting}
              onClick={() => {
                setError(null);
                setCancelling(true);
              }}
              type="button"
            >
              Cancelar venta
            </button>
          ) : null}
        </div>
      )}

      {mayConfirm ? (
        <p className="sale-actions-hint">
          Confirmar la entrega no cobra la venta ni descuenta inventario otra
          vez: el pago sigue pendiente.
        </p>
      ) : null}
    </section>
  );
}
