'use client';

import type { DailyClosingView } from '@sgi/contracts';
import { useRef, useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { closingsApi } from '@/lib/http/finances-api';
import { canReopen } from '@/lib/finances/presentation';
import { useAuth } from '@/providers/auth-provider';

function reopenError(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'CLOSING_ALREADY_REOPENED') {
      return 'El cierre ya no está en un estado que permita reabrirlo.';
    }
    if (error.code === 'CLOSING_REOPENING_WINDOW_EXPIRED') {
      return 'La ventana para reabrir este cierre ya venció.';
    }
    if (error.code === 'IDEMPOTENCY_KEY_REUSED') {
      return 'La intención cambió durante el envío. Vuelve a intentarlo.';
    }
    if (error.status === 401) return 'La sesión ya no es válida.';
    if (error.status === 403) return 'No tienes permiso para reabrir cierres.';
    if (error.status === 404) return 'El cierre ya no está disponible.';
    if (error.status === 409) {
      return 'La operación entró en conflicto con otro cambio. Actualiza la página.';
    }
  }
  return 'No fue posible reabrir el cierre. No se reintentará automáticamente.';
}

export function ClosingReopenAction({
  closing,
  onUpdated,
}: Readonly<{
  closing: DailyClosingView;
  onUpdated: (closing: DailyClosingView) => void;
}>) {
  const { getCsrfToken, state } = useAuth();
  const submissionRef = useRef(false);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reopening, setReopening] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Controls are hidden by permission, but the backend authorizes every call.
  const mayReopen =
    state.kind === 'authenticated' &&
    state.session.permissions.includes('closings.reopen') &&
    canReopen(closing);

  if (!mayReopen) return null;

  async function submit() {
    if (submissionRef.current) return;
    submissionRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await closingsApi.reopen(
        closing.id,
        reason.trim(),
        await getCsrfToken(),
        idempotencyKeyRef.current,
      );
      idempotencyKeyRef.current = crypto.randomUUID();
      onUpdated(updated);
      setReopening(false);
      setReason('');
    } catch (submissionError) {
      setError(reopenError(submissionError));
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="sale-actions" aria-label="Reabrir cierre">
      {error ? (
        <div className="form-feedback" data-tone="error" role="alert">
          {error}
        </div>
      ) : null}

      {reopening ? (
        <div className="sale-cancel-panel">
          <p>
            Reabrir conserva las cifras congeladas de este cierre; no se vuelve
            a cerrar. Queda registrado con tu usuario y la fecha.
          </p>
          <label>
            <span>Motivo</span>
            <input
              maxLength={500}
              onChange={(event) => {
                setReason(event.target.value);
                setError(null);
              }}
              placeholder="Explica por qué se reabre"
              value={reason}
            />
          </label>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setReopening(false);
                setReason('');
                setError(null);
              }}
              type="button"
            >
              Volver
            </button>
            <button
              className="primary-button"
              disabled={submitting || reason.trim().length === 0}
              onClick={() => void submit()}
              type="button"
            >
              {submitting ? 'Reabriendo…' : 'Confirmar reapertura'}
            </button>
          </div>
        </div>
      ) : (
        <button
          className="secondary-button"
          onClick={() => {
            setError(null);
            setReopening(true);
          }}
          type="button"
        >
          Reabrir cierre
        </button>
      )}
    </section>
  );
}
