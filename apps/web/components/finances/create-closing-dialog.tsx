'use client';

import type { DailyClosingPreviewView, DailyClosingView } from '@sgi/contracts';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { formatMoney } from '@/lib/inventory/presentation';
import { ApiHttpError } from '@/lib/http/api-client';
import { closingsApi } from '@/lib/http/finances-api';
import { closingBalance, closingPreview } from '@/lib/finances/closing-preview';
import { useAuth } from '@/providers/auth-provider';
import { useModalDialog } from '@/lib/use-modal-dialog';

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
  const [day, setDay] = useState<DailyClosingPreviewView | null>(null);
  const [dayError, setDayError] = useState(false);

  // The day's figures load as soon as a date is chosen, so the partner counts
  // the drawer against a number on screen instead of after saving.
  useEffect(() => {
    const controller = new AbortController();
    const scheduled = window.setTimeout(() => {
      setDay(null);
      setDayError(false);
      closingsApi
        .preview(businessDate, controller.signal)
        .then((loaded) => setDay(loaded))
        .catch(() => {
          if (!controller.signal.aborted) setDayError(true);
        });
    }, 0);
    return () => {
      window.clearTimeout(scheduled);
      controller.abort();
    };
  }, [businessDate]);

  const balance = day
    ? closingBalance(day.systemSales, realCash, realDigital, day.tolerance)
    : { kind: 'unknown' as const };

  const preview = closingPreview(
    businessDate,
    realCash || '0',
    realDigital || '0',
  );
  const canSubmit =
    preview.kind === 'valid' && !submitting && day?.alreadyClosed !== true;

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

  // FASE 10B. Escape, focus trap and focus restoration for this
  // aria-modal dialog; disabled while a submission is in flight, matching
  // the close control.
  const dialogRef = useModalDialog<HTMLElement>(onCancel, !submitting);

  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="create-closing-title"
        aria-modal="true"
        className="adjustment-dialog"
        ref={dialogRef}
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
          {dayError ? (
            <p className="form-feedback" data-tone="warning" role="status">
              No fue posible cargar las ventas del día. Podés cerrar de todos
              modos: el servidor calcula la cifra definitiva.
            </p>
          ) : null}

          {day?.alreadyClosed ? (
            <p className="form-feedback" data-tone="warning" role="alert">
              Esa fecha ya tiene un cierre registrado. Revisalo antes de
              intentar cerrarla otra vez.
            </p>
          ) : null}

          {day ? (
            <>
              <div className="kpi-grid">
                <article className="kpi-card">
                  <span className="kpi-label">Ventas del día</span>
                  <span className="kpi-value">
                    {formatMoney(day.systemSales)}
                  </span>
                  <span className="kpi-note">Solo ventas completadas</span>
                </article>
                <article className="kpi-card">
                  <span className="kpi-label">En tránsito</span>
                  <span
                    className="kpi-value"
                    data-tone={
                      day.inTransitSaleCount > 0 ? 'warning' : undefined
                    }
                  >
                    {day.inTransitSaleCount}
                  </span>
                  <span className="kpi-note">No afectan el cuadre</span>
                </article>
                <article className="kpi-card">
                  <span className="kpi-label">Gastos del día</span>
                  <span className="kpi-value">
                    {formatMoney(day.totalExpenses)}
                  </span>
                  <span className="kpi-note">Contexto: no restan</span>
                </article>
              </div>

              {day.bySeller.length > 0 ? (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Vendedor</th>
                        <th scope="col">Efectivo</th>
                        <th scope="col">Digital</th>
                        <th scope="col">Sin método</th>
                        <th scope="col">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.bySeller.map((seller) => (
                        <tr key={seller.sellerUserId ?? 'sin-vendedor'}>
                          <td data-label="Vendedor">{seller.sellerName}</td>
                          <td data-label="Efectivo" data-numeric="true">
                            {formatMoney(seller.cashAmount)}
                          </td>
                          <td data-label="Digital" data-numeric="true">
                            {formatMoney(seller.digitalAmount)}
                          </td>
                          <td data-label="Sin método" data-numeric="true">
                            {formatMoney(seller.unspecifiedAmount)}
                          </td>
                          <td data-label="Total" data-numeric="true">
                            {formatMoney(seller.totalAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : null}

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

          {balance.kind === 'known' ? (
            <p
              className="form-feedback"
              data-tone={balance.balanced ? 'success' : 'warning'}
              role="status"
            >
              {balance.balanced
                ? `Caja cuadrada. Diferencia ${formatMoney(balance.difference)}.`
                : `Descuadre de ${formatMoney(balance.difference)}. Tolerancia ${formatMoney(day?.tolerance ?? '0')}.`}
            </p>
          ) : null}
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
