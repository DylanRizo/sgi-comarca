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
      return 'El producto, almacen o saldo ya no esta disponible.';
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
  const [error, setError] = useState<string | null>(null);
  const [quantityDelta, setQuantityDelta] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
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
      );
      onSuccess(result);
    } catch (submissionError) {
      setError(adjustmentError(submissionError));
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  const direction =
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
            <dt>Almacen</dt>
            <dd>{selection.balance.warehouse.name}</dd>
          </div>
        </dl>

        {error ? (
          <div className="form-feedback" data-tone="error" role="alert">
            {error}
          </div>
        ) : null}

        <form aria-busy={submitting} onSubmit={submit}>
          <label className="filter-field" htmlFor="quantityDelta">
            <span>Delta firmado</span>
            <input
              aria-describedby="delta-help"
              disabled={submitting}
              id="quantityDelta"
              inputMode="decimal"
              maxLength={20}
              onChange={(event) => setQuantityDelta(event.target.value)}
              placeholder="Ejemplo: +5 o -3"
              ref={deltaRef}
              required
              value={quantityDelta}
            />
          </label>
          <p className="field-help" id="delta-help">
            Usa un valor positivo para entrada y negativo para salida. Maximo 4
            decimales.
          </p>
          <label className="filter-field" htmlFor="adjustmentReason">
            <span>Motivo obligatorio</span>
            <textarea
              disabled={submitting}
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
            <strong>{direction}</strong>
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
                : `Confirmar ${direction.toLowerCase()}`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
