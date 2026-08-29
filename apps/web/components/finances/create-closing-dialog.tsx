'use client';

import type { DailyClosingView } from '@sgi/contracts';
import { type FormEvent, useRef, useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { closingsApi } from '@/lib/http/finances-api';
import { closingPreview } from '@/lib/finances/closing-preview';
import { useAuth } from '@/providers/auth-provider';

function createClosingError(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'CLOSING_ALREADY_EXISTS') {
      return 'Ya existe un cierre para esa fecha.';
    }
    if (error.code === 'IDEMPOTENCY_KEY_REUSED') {
      return 'La intención cambió durante el envío. Vuelve a intentarlo.';
    }
    if (error.status === 401) return 'La sesión ya no es válida.';
    if (error.status === 403) return 'No tienes permiso para crear cierres.';
    if (error.status === 409) {
      return 'El cierre entró en conflicto con otro cambio. Vuelve a intentarlo.';
    }
    if (error.status === 400) return 'Revisa la fecha y los montos contados.';
  }
  return 'No fue posible registrar el cierre. No se reintentará automáticamente.';
}

function todayInManagua(): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Managua',
    year: 'numeric',
  }).format(new Date());
}

export function CreateClosingDialog({
  onCancel,
  onSuccess,
}: Readonly<{
  onCancel: () => void;
  onSuccess: (closing: DailyClosingView) => void;
}>) {
  const { getCsrfToken } = useAuth();
  const submissionRef = useRef(false);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const [businessDate, setBusinessDate] = useState(todayInManagua);
  const [error, setError] = useState<string | null>(null);
  const [observations, setObservations] = useState('');
  const [realCash, setRealCash] = useState('');
  const [realDigital, setRealDigital] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const preview = closingPreview(
    businessDate,
    realCash || '0',
    realDigital || '0',
  );
  const canSubmit = preview.kind === 'valid' && !submitting;

  function changeIntent(action: () => void) {
    action();
    setError(null);
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submissionRef.current) return;
    submissionRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const trimmedObservations = observations.trim();
      const closing = await closingsApi.create(
        {
          businessDate,
          ...(trimmedObservations ? { observations: trimmedObservations } : {}),
          realCash: realCash || '0',
          realDigital: realDigital || '0',
        },
        await getCsrfToken(),
        idempotencyKeyRef.current,
      );
      idempotencyKeyRef.current = crypto.randomUUID();
      onSuccess(closing);
    } catch (submissionError) {
      setError(createClosingError(submissionError));
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="create-closing-title"
        aria-modal="true"
        className="adjustment-dialog"
        role="dialog"
      >
        <header>
          <h2 id="create-closing-title">Crear cierre diario</h2>
          <p>
            El servidor calcula las ventas del sistema, la diferencia y si
            cuadra. Las ventas en tránsito de la fecha quedan reportadas, sin
            tocarlas.
          </p>
        </header>

        <form onSubmit={submit}>
          <label className="filter-field">
            <span>Fecha</span>
            <input
              onChange={(event) =>
                changeIntent(() => setBusinessDate(event.target.value))
              }
              required
              type="date"
              value={businessDate}
            />
          </label>
          <div className="sale-form-grid">
            <label className="filter-field">
              <span>Efectivo contado (C$)</span>
              <input
                inputMode="decimal"
                onChange={(event) =>
                  changeIntent(() => setRealCash(event.target.value))
                }
                placeholder="0.00"
                value={realCash}
              />
            </label>
            <label className="filter-field">
              <span>Digital contado (C$)</span>
              <input
                inputMode="decimal"
                onChange={(event) =>
                  changeIntent(() => setRealDigital(event.target.value))
                }
                placeholder="0.00"
                value={realDigital}
              />
            </label>
          </div>
          <label className="filter-field">
            <span>Observaciones (opcional)</span>
            <input
              maxLength={500}
              onChange={(event) =>
                changeIntent(() => setObservations(event.target.value))
              }
              value={observations}
            />
          </label>

          {preview.kind === 'invalid' ? (
            <div className="form-feedback" data-tone="warning" role="status">
              {preview.field === 'businessDate'
                ? 'Selecciona una fecha válida.'
                : 'Los montos contados deben ser no negativos, con máximo 2 decimales.'}
            </div>
          ) : null}

          {error ? (
            <div className="form-feedback" data-tone="error" role="alert">
              {error}
            </div>
          ) : null}

          <footer className="dialog-actions">
            <button
              className="secondary-button"
              onClick={onCancel}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="primary-button"
              disabled={!canSubmit}
              type="submit"
            >
              {submitting ? 'Registrando…' : 'Crear cierre'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
