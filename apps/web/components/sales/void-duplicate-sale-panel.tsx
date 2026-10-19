'use client';

import type { SaleView } from '@sgi/contracts';
import { useRef, useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { salesApi } from '@/lib/http/sales-api';
import { formatMoney, formatQuantity } from '@/lib/inventory/presentation';
import { useAuth } from '@/providers/auth-provider';

function errorMessage(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'REQUEST_VERIFICATION_FAILED')
      return 'No se pudo verificar la solicitud. Reintenta la misma corrección para renovar la verificación sin cambiar sus datos.';
    if (error.status === 403)
      return 'Sólo el administrador autorizado puede anular por duplicado.';
    if (error.status === 404)
      return 'No se encontró la venta. Revisa el número completo.';
    if (error.code === 'SALE_DAY_ALREADY_CLOSED')
      return 'El día ya tiene un cierre registrado. Esta función no modifica cierres; requiere una revisión administrativa separada.';
    if (error.code === 'SALE_DUPLICATE_TARGET_INVALID')
      return 'La venta correcta debe estar completada, sin pagar y tener el mismo total, moneda y fecha.';
    if (error.code === 'SALE_INVALID_STATE')
      return 'La venta cambió de estado y ya no admite esta corrección. Actualiza su detalle.';
    if (error.code === 'IDEMPOTENCY_KEY_REUSED')
      return 'El intento pendiente pertenece a otra corrección. Actualiza la página antes de continuar.';
  }
  return 'No se pudo confirmar el resultado. Conservamos tu intento: reintenta sin cambiar los datos para no duplicar la operación.';
}

export function VoidDuplicateSalePanel({
  sale,
  onUpdated,
}: Readonly<{ sale: SaleView; onUpdated: (sale: SaleView) => void }>) {
  const { state, getCsrfToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [target, setTarget] = useState<SaleView | null>(null);
  const [reason, setReason] = useState('');
  const [stockReturned, setStockReturned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const key = useRef(crypto.randomUUID());
  const permissions =
    state.kind === 'authenticated' ? state.session.permissions : [];
  if (
    !permissions.includes('sales.cancel') ||
    sale.origin !== 'OPERATIONAL' ||
    sale.status !== 'COMPLETED' ||
    sale.paymentStatus !== 'PAID' ||
    !sale.payment ||
    sale.duplicateCorrection
  )
    return null;

  async function review() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setTarget(null);
    try {
      const candidate = await salesApi.byNumber(number.trim().toUpperCase());
      if (
        candidate.id === sale.id ||
        candidate.origin !== 'OPERATIONAL' ||
        candidate.status !== 'COMPLETED' ||
        candidate.paymentStatus !== 'PENDING' ||
        candidate.duplicateCorrection ||
        candidate.total !== sale.total ||
        candidate.currencyCode !== sale.currencyCode ||
        candidate.businessDate !== sale.businessDate
      ) {
        setError(
          'La venta correcta debe ser distinta, estar completada y sin pagar, con el mismo total, moneda y fecha.',
        );
      } else setTarget(candidate);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function submit() {
    if (lock.current || !target || !stockReturned || !reason.trim()) return;
    const wasUncertain = uncertain;
    lock.current = true;
    setBusy(true);
    setError(null);
    setUncertain(true);
    try {
      const updated = await salesApi.voidDuplicate(
        sale.id,
        {
          reason: reason.trim(),
          replacementSaleNumber: target.saleNumber,
          stockReturned: true,
        },
        await getCsrfToken(wasUncertain),
        key.current,
      );
      onUpdated(updated);
    } catch (failure) {
      // A transport failure might follow a commit. Keep key AND intent frozen
      // until the exact request can be replayed or the server confirms refusal.
      if (
        !wasUncertain &&
        failure instanceof ApiHttpError &&
        failure.status >= 400 &&
        failure.status < 500
      )
        setUncertain(false);
      setError(errorMessage(failure));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="sale-actions" aria-label="Anulación por duplicado">
      {!open ? (
        <button
          className="danger-button"
          type="button"
          onClick={() => setOpen(true)}
        >
          Anular venta duplicada
        </button>
      ) : (
        <div className="sale-cancel-panel duplicate-void-panel">
          <h2>Anular {sale.saleNumber} por duplicado</h2>
          <p>
            Úsalo sólo si la venta correcta ya está registrada y el cobro
            corresponde a ella. No es un reembolso ni un borrado del historial.
          </p>
          {error ? (
            <div className="form-feedback" data-tone="error" role="alert">
              {error}
            </div>
          ) : null}
          <fieldset disabled={busy || uncertain}>
            <label>
              <span>Número de la venta correcta</span>
              <input
                value={number}
                maxLength={13}
                placeholder="VTA-000000000"
                onChange={(event) => {
                  setNumber(event.target.value);
                  setTarget(null);
                  setError(null);
                }}
              />
            </label>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void review()}
            >
              Revisar venta correcta
            </button>
            <label>
              <span>Motivo de la anulación</span>
              <textarea
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </fieldset>
          {target ? (
            <>
              <section aria-label="Revisión de la corrección">
                <h3>Se conservará {target.saleNumber}</h3>
                <ul>
                  {target.items.map((item) => (
                    <li key={item.id}>
                      {item.product.code} — {item.product.name} ·{' '}
                      {formatQuantity(item.quantity)} · {item.warehouse.name}
                    </li>
                  ))}
                </ul>
                <p>
                  Recibirá el cobro existente de{' '}
                  {formatMoney(sale.total, sale.currencyCode)}. No se cobra ni
                  se descuenta inventario otra vez.
                </p>
                <h3>Se repondrá el inventario de {sale.saleNumber}</h3>
                <ul>
                  {sale.items.map((item) => (
                    <li key={item.id}>
                      {item.product.code} — {item.product.name} · +
                      {formatQuantity(item.quantity)} · {item.warehouse.name}
                    </li>
                  ))}
                </ul>
              </section>
              <label className="stock-returned-confirmation">
                <input
                  type="checkbox"
                  checked={stockReturned}
                  disabled={busy || uncertain}
                  onChange={(event) => setStockReturned(event.target.checked)}
                />
                Confirmo que todos estos productos siguen en, o regresaron a,
                sus bodegas de origen.
              </label>
            </>
          ) : null}
          {uncertain && !busy ? (
            <p role="status">
              Hay un intento pendiente de confirmar. Reintenta la misma
              corrección o actualiza el detalle para comprobar el resultado.
            </p>
          ) : null}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={busy || uncertain}
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Volver
            </button>
            <button
              className="danger-button"
              type="button"
              disabled={busy || !target || !stockReturned || !reason.trim()}
              onClick={() => void submit()}
            >
              {busy
                ? 'Procesando…'
                : uncertain
                  ? 'Reintentar misma corrección'
                  : 'Confirmar anulación y reasignar cobro'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
