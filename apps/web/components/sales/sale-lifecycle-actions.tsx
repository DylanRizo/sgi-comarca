'use client';

import type { SaleView } from '@sgi/contracts';
import { useRef, useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { salesApi } from '@/lib/http/sales-api';
import {
  canCancel,
  canConfirm,
  canRecordPayment,
} from '@/lib/sales/presentation';
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
  const paymentKeyRef = useRef(crypto.randomUUID());
  const [cancelling, setCancelling] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethodText, setPaymentMethodText] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Controls are hidden by permission, but the backend authorizes every call.
  const permissions =
    state.kind === 'authenticated' ? state.session.permissions : [];
  const mayConfirm =
    permissions.includes('sales.confirm_in_transit') && canConfirm(sale);
  const mayCancel = permissions.includes('sales.cancel') && canCancel(sale);
  const mayRecordPayment =
    permissions.includes('sales.record_payment') && canRecordPayment(sale);

  if (!mayConfirm && !mayCancel && !mayRecordPayment) return null;

  async function run(action: () => Promise<SaleView>) {
    if (submissionRef.current) return;
    submissionRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      onUpdated(await action());
      confirmKeyRef.current = crypto.randomUUID();
      cancelKeyRef.current = crypto.randomUUID();
      paymentKeyRef.current = crypto.randomUUID();
      setCancelling(false);
      setRecordingPayment(false);
      setPaymentMethodText('');
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
            Cancelar es total y devuelve el inventario a cada bodega de origen.
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
      ) : recordingPayment ? (
        <div className="sale-cancel-panel">
          <p>
            Se registrará el pago total de esta venta. El registro conserva
            fecha, responsable y método de pago, y no modifica el inventario.
          </p>
          <label>
            <span>Medio de pago</span>
            <input
              autoComplete="off"
              maxLength={160}
              onChange={(event) => {
                setPaymentMethodText(event.target.value);
                setError(null);
              }}
              placeholder="Efectivo, transferencia, tarjeta…"
              value={paymentMethodText}
            />
          </label>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setRecordingPayment(false);
                setPaymentMethodText('');
                setError(null);
              }}
              type="button"
            >
              Volver
            </button>
            <button
              className="primary-button"
              disabled={submitting || paymentMethodText.trim().length === 0}
              onClick={() =>
                void run(async () =>
                  salesApi.recordPayment(
                    sale.id,
                    { paymentMethodText: paymentMethodText.trim() },
                    await getCsrfToken(),
                    paymentKeyRef.current,
                  ),
                )
              }
              type="button"
            >
              {submitting ? 'Registrando…' : 'Confirmar pago'}
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
          {mayRecordPayment ? (
            <button
              className="primary-button"
              disabled={submitting}
              onClick={() => {
                setError(null);
                setPaymentMethodText(sale.paymentMethodText ?? '');
                setRecordingPayment(true);
              }}
              type="button"
            >
              Registrar pago
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
