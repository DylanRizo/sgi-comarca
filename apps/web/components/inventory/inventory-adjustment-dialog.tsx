'use client';

import type {
  InventoryAdjustmentResult,
  InventoryBalanceView,
  ProductDetail,
} from '@sgi/contracts';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { inventoryApi } from '@/lib/http/inventory-api';
import { adjustmentPreview } from '@/lib/inventory/adjustment-preview';
import { formatQuantity } from '@/lib/inventory/presentation';
import { useAuth } from '@/providers/auth-provider';
import { useModalDialog } from '@/lib/use-modal-dialog';

export type InventoryAdjustmentSelection = {
  balance: InventoryBalanceView;
  product: ProductDetail;
};

function adjustmentError(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'INVENTORY_NEGATIVE_BALANCE') {
      return 'El saldo cambio y el ajuste produciria inventario negativo. Actualiza la vista e intenta nuevamente.';
    }
    if (error.status === 401) return 'La sesion ya no es valida.';
    if (error.status === 403) return 'No tienes permiso para realizar ajustes.';
    if (error.status === 404) {
      return 'El producto, la bodega o el saldo ya no está disponible.';
    }
    if (error.status === 409) {
      return 'El inventario cambio durante la operacion. Actualiza la vista antes de reintentar.';
    }
    if (error.status === 400) return 'Revisa la cantidad y el motivo.';
  }
  return 'No fue posible guardar el ajuste. No se reintentara automaticamente.';
}

export function InventoryAdjustmentDialog({
  onCancel,
  onSuccess,
  selection,
}: Readonly<{
  onCancel: () => void;
  onSuccess: (result: InventoryAdjustmentResult) => void;
  selection: InventoryAdjustmentSelection;
}>) {
  const { getCsrfToken } = useAuth();
  const deltaRef = useRef<HTMLInputElement>(null);
  const submissionRef = useRef(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<'increase' | 'decrease'>(
    'increase',
  );
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const quantityDelta =
    direction === 'decrease' && quantity ? `-${quantity}` : quantity;
  const preview = adjustmentPreview(selection.balance.quantity, quantityDelta);
  const canSubmit =
    preview.kind === 'valid' && reason.trim().length > 0 && !submitting;

  useEffect(() => deltaRef.current?.focus(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || preview.kind !== 'valid' || submissionRef.current) return;
    submissionRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const result = await inventoryApi.adjust(
        {
          productId: selection.product.id,
          quantityDelta: preview.quantityDelta,
          reason: reason.trim(),
          warehouseId: selection.balance.warehouse.id,
        },
        await getCsrfToken(),
        idempotencyKey.current,
      );
      onSuccess(result);
    } catch (submissionError) {
      const ambiguous =
        !(submissionError instanceof ApiHttpError) ||
        submissionError.status >= 500;
      setUncertain(ambiguous);
      setError(
        ambiguous
          ? 'No pudimos confirmar la respuesta. Conservamos este ajuste: pulsa Reintentar para recuperar el resultado sin duplicarlo.'
          : adjustmentError(submissionError),
      );
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  const directionLabel =
    preview.kind === 'valid'
      ? preview.direction === 'ENTRY'
        ? `ENTRADA +${preview.quantityDelta}`
        : `SALIDA ${preview.quantityDelta}`
      : 'AJUSTE PENDIENTE';

  // FASE 10B. Escape, focus trap and focus restoration for this
  // aria-modal dialog; disabled while a submission is in flight, matching
  // the close control.
  const dialogRef = useModalDialog<HTMLElement>(onCancel, !submitting);

  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="adjustment-title"
        aria-modal="true"
        className="adjustment-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow">Correccion manual</p>
            <h2 id="adjustment-title">Ajustar inventario</h2>
          </div>
          <button
            aria-label="Cerrar ajuste"
            className="icon-button"
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            Cerrar
          </button>
        </header>

        <dl className="adjustment-context">
          <div>
            <dt>Producto</dt>
            <dd>
              {selection.product.code} · {selection.product.name}
            </dd>
          </div>
          <div>
            <dt>Bodega</dt>
            <dd>{selection.balance.warehouse.name}</dd>
          </div>
        </dl>

        {error ? (
          <div className="form-feedback" data-tone="error" role="alert">
            {error}
          </div>
        ) : null}

        <form aria-busy={submitting} onSubmit={submit}>
          <label className="filter-field" htmlFor="adjustmentDirection">
            <span>Tipo de ajuste</span>
            <select
              disabled={submitting || uncertain}
              id="adjustmentDirection"
              onChange={(event) =>
                setDirection(event.target.value as 'increase' | 'decrease')
              }
              value={direction}
            >
              <option value="increase">Aumentar existencias</option>
              <option value="decrease">Disminuir existencias</option>
            </select>
          </label>
          <label className="filter-field" htmlFor="adjustmentQuantity">
            <span>Cantidad</span>
            <input
              aria-describedby="quantity-help"
              disabled={submitting || uncertain}
              id="adjustmentQuantity"
              inputMode="decimal"
              maxLength={20}
              min="0.0001"
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="Ejemplo: 5 o 3.25"
              ref={deltaRef}
              required
              step="0.0001"
              type="number"
              value={quantity}
            />
          </label>
          <p className="field-help" id="quantity-help">
            Ingresa siempre una cantidad positiva. La vista mostrará el saldo
            resultante antes de guardar.
          </p>
          <label className="filter-field" htmlFor="adjustmentReason">
            <span>Motivo obligatorio</span>
            <textarea
              disabled={submitting || uncertain}
              id="adjustmentReason"
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              required
              rows={3}
              value={reason}
            />
          </label>

          <div
            className="adjustment-preview"
            data-valid={preview.kind === 'valid'}
          >
            <strong>{directionLabel}</strong>
            <div>
              <span>{formatQuantity(selection.balance.quantity)}</span>
              <span>
                {preview.kind === 'valid' ? preview.quantityDelta : '—'}
              </span>
              <span>=</span>
              <strong>
                {preview.kind === 'valid'
                  ? formatQuantity(preview.balanceAfter)
                  : '—'}
              </strong>
            </div>
            {preview.kind === 'negative' ? (
              <p role="alert">El saldo resultante no puede ser negativo.</p>
            ) : preview.kind === 'zero' ? (
              <p role="alert">El ajuste no puede ser cero.</p>
            ) : preview.kind === 'invalid' ? (
              <p role="alert">Ingresa una cantidad valida.</p>
            ) : null}
          </div>

          <div className="dialog-actions">
            <button
              className="secondary-button"
              disabled={submitting}
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
              {submitting
                ? 'Guardando…'
                : uncertain
                  ? 'Reintentar sin duplicar'
                  : `Confirmar ${directionLabel.toLowerCase()}`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
