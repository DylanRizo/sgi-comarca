'use client';

import type { RecordSalePaymentRequest, SaleView } from '@sgi/contracts';
import { useRef, useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { salesApi } from '@/lib/http/sales-api';
import { formatMoney } from '@/lib/inventory/presentation';
import {
  splitPaymentDraft,
  type PaymentDraftLine,
} from '@/lib/sales/payment-draft';
import { useAuth } from '@/providers/auth-provider';

function paymentError(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'SALE_SPLIT_PAYMENT_SUM_MISMATCH')
      return 'Los importes deben sumar exactamente el total de la venta.';
    if (error.code === 'SALE_PAYMENT_AMOUNT_INVALID')
      return 'Cada importe debe ser positivo, válido y tener como máximo dos decimales.';
    if (error.status === 401)
      return 'Tu sesión venció. Inicia sesión y consulta la venta antes de volver a cobrar.';
    if (error.status === 403)
      return 'No se autorizó este intento. Puedes reintentar; el servidor comprobará tus permisos.';
    if (error.status === 409)
      return 'La venta cambió o la solicitud entró en conflicto. Consulta su estado antes de continuar.';
  }
  return 'No se pudo confirmar el resultado. Reintenta el mismo pago; no se cobrará dos veces.';
}

export function RecordSalePaymentPanel({
  sale,
  onUpdated,
  onClose,
}: Readonly<{
  sale: SaleView;
  onUpdated: (sale: SaleView) => void;
  onClose: () => void;
}>) {
  const { getCsrfToken } = useAuth();
  const key = useRef(crypto.randomUUID());
  const inFlight = useRef(false);
  const intent = useRef<RecordSalePaymentRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState('single');
  const [method, setMethod] = useState(sale.paymentMethodText ?? '');
  const [lines, setLines] = useState<PaymentDraftLine[]>([
    { id: crypto.randomUUID(), methodText: 'Efectivo', amount: '' },
    { id: crypto.randomUUID(), methodText: 'Digital', amount: '' },
  ]);
  const preview = splitPaymentDraft(sale.total, lines);
  const currencyLabel = sale.currencyCode === 'NIO' ? 'C$' : sale.currencyCode;
  const request: RecordSalePaymentRequest | null =
    mode === 'split'
      ? preview.request
      : method.trim()
        ? { paymentMethodText: method.trim() }
        : null;
  const updateLine = (
    id: string,
    field: 'amount' | 'methodText',
    value: string,
  ) => {
    setLines((current) =>
      current.map((line) =>
        line.id === id ? { ...line, [field]: value } : line,
      ),
    );
    setError(null);
  };
  async function submit() {
    if (inFlight.current || (!intent.current && !request)) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const wasUncertain = uncertain;
    const payload = intent.current ?? request!;
    intent.current = payload;
    try {
      const result = await salesApi.recordPayment(
        sale.id,
        payload,
        await getCsrfToken(wasUncertain),
        key.current,
      );
      onUpdated(result);
    } catch (failure) {
      const ambiguous =
        !(failure instanceof ApiHttpError) ||
        failure.status < 400 ||
        failure.status >= 500;
      setUncertain(wasUncertain || ambiguous);
      if (!wasUncertain && !ambiguous) {
        intent.current = null;
        // A refused request has not claimed this key; preserve it for correction/retry.
      }
      setError(paymentError(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="sale-cancel-panel payment-record-panel"
      aria-label="Registrar pago de la venta"
    >
      <h2>Registrar pago</h2>
      <p>
        Un solo recibo por el total. El pago no vuelve a descontar inventario.
      </p>
      {error ? (
        <p className="form-feedback" data-tone="error" role="alert">
          {error}
        </p>
      ) : null}
      <fieldset disabled={busy || uncertain}>
        <label>
          <span>Tipo de pago</span>
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value);
              setError(null);
            }}
          >
            <option value="single">Pago único</option>
            <option value="split">Pago híbrido / mixto</option>
          </select>
        </label>
        {mode === 'single' ? (
          <label>
            <span>Medio de pago</span>
            <input
              maxLength={160}
              autoComplete="off"
              value={method}
              onChange={(event) => {
                setMethod(event.target.value);
                setError(null);
              }}
              placeholder="Efectivo, transferencia, tarjeta…"
            />
          </label>
        ) : (
          <>
            {lines.map((line, index) => (
              <div className="payment-part-row" key={line.id}>
                <label>
                  <span>Medio de pago {index + 1}</span>
                  <input
                    maxLength={160}
                    autoComplete="off"
                    value={line.methodText}
                    onChange={(event) =>
                      updateLine(line.id, 'methodText', event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>
                    Importe {index + 1} ({currencyLabel})
                  </span>
                  <input
                    inputMode="decimal"
                    maxLength={20}
                    value={line.amount}
                    onChange={(event) =>
                      updateLine(line.id, 'amount', event.target.value)
                    }
                    placeholder="0.00"
                  />
                </label>
                {lines.length > 2 ? (
                  <button
                    className="secondary-button"
                    type="button"
                    aria-label={`Quitar medio de pago ${index + 1}`}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.id !== line.id),
                      )
                    }
                  >
                    Quitar
                  </button>
                ) : null}
              </div>
            ))}
            <button
              className="secondary-button"
              type="button"
              disabled={lines.length >= 10}
              onClick={() =>
                setLines((current) => [
                  ...current,
                  { id: crypto.randomUUID(), methodText: '', amount: '' },
                ])
              }
            >
              Añadir medio de pago
            </button>
            <dl className="payment-summary" aria-live="polite">
              <div>
                <dt>Total venta</dt>
                <dd>{formatMoney(sale.total, sale.currencyCode)}</dd>
              </div>
              <div>
                <dt>Total asignado</dt>
                <dd>{formatMoney(preview.assigned, sale.currencyCode)}</dd>
              </div>
              <div>
                <dt>Restante</dt>
                <dd>{formatMoney(preview.remaining, sale.currencyCode)}</dd>
              </div>
            </dl>
            {!preview.request ? (
              <p>
                Completa importes positivos con hasta dos decimales. El restante
                debe ser {formatMoney('0.00', sale.currencyCode)}.
              </p>
            ) : null}
          </>
        )}
      </fieldset>
      {uncertain ? (
        <p role="status">
          El resultado anterior es incierto. Conservamos los importes y la
          solicitud original para un reintento seguro. También puedes consultar
          de nuevo la venta.
        </p>
      ) : null}
      <div className="dialog-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={busy || uncertain}
          onClick={onClose}
        >
          Volver
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={busy || (!uncertain && request === null)}
          onClick={() => void submit()}
        >
          {busy
            ? 'Registrando…'
            : uncertain
              ? 'Reintentar el mismo pago'
              : 'Confirmar pago'}
        </button>
      </div>
    </section>
  );
}
