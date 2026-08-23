'use client';

import type {
  InventoryTransferResult,
  ProductInventoryView,
  WarehouseSummary,
} from '@sgi/contracts';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { inventoryApi } from '@/lib/http/inventory-api';
import { formatQuantity } from '@/lib/inventory/presentation';
import { transferPreview } from '@/lib/inventory/transfer-preview';
import { useAuth } from '@/providers/auth-provider';

function transferError(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'INVENTORY_TRANSFER_INSUFFICIENT_STOCK') {
      return 'El saldo de origen cambio y ya no es suficiente. Actualiza los datos antes de intentar otra intención.';
    }
    if (error.code === 'IDEMPOTENCY_KEY_REUSED') {
      return 'La intención cambió durante el envío. Cierra el formulario y vuelve a iniciarla.';
    }
    if (error.status === 401) return 'La sesión ya no es válida.';
    if (error.status === 403) return 'No tienes permiso para transferir.';
    if (error.status === 404) {
      return 'El producto, almacén o saldo de origen ya no está disponible.';
    }
    if (error.status === 409) {
      return 'La transferencia entró en conflicto con otro cambio de inventario. Actualiza los datos.';
    }
    if (error.status === 400) return 'Revisa almacenes, cantidad y motivo.';
  }
  return 'No fue posible transferir. No se reintentará automáticamente.';
}

export function InventoryTransferDialog({
  onCancel,
  onSuccess,
}: Readonly<{
  onCancel: () => void;
  onSuccess: (result: InventoryTransferResult) => void;
}>) {
  const { getCsrfToken } = useAuth();
  const submissionRef = useRef(false);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<readonly ProductInventoryView[]>([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<readonly WarehouseSummary[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const inventory = await inventoryApi.allInventory(controller.signal);
      const warehousePage = await inventoryApi.warehouses(controller.signal);
      return { inventory, warehousePage };
    })()
      .then(({ inventory, warehousePage }) => {
        setProducts(inventory);
        setWarehouses(warehousePage.items);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(transferError(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const selectedProduct = products.find(
    ({ product }) => product.id === productId,
  );
  const origin = selectedProduct?.balances.find(
    ({ warehouse }) => warehouse.id === fromWarehouseId,
  );
  const destination = selectedProduct?.balances.find(
    ({ warehouse }) => warehouse.id === toWarehouseId,
  );
  const preview = transferPreview(
    origin?.quantity,
    destination?.quantity,
    quantity,
    Boolean(fromWarehouseId && fromWarehouseId === toWarehouseId),
    selectedProduct?.totalQuantity,
  );
  const canSubmit =
    preview.kind === 'valid' &&
    reason.trim().length > 0 &&
    !submitting &&
    !loading;

  function changeIntent(action: () => void) {
    action();
    setError(null);
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !canSubmit ||
      preview.kind !== 'valid' ||
      submissionRef.current ||
      !selectedProduct
    ) {
      return;
    }
    submissionRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const result = await inventoryApi.transfer(
        {
          fromWarehouseId,
          productId: selectedProduct.product.id,
          quantity: preview.quantity,
          reason: reason.trim(),
          toWarehouseId,
        },
        await getCsrfToken(),
        idempotencyKeyRef.current,
      );
      idempotencyKeyRef.current = crypto.randomUUID();
      onSuccess(result);
    } catch (submissionError) {
      setError(transferError(submissionError));
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  const previewMessage =
    preview.kind === 'insufficient'
      ? 'La cantidad supera el stock disponible en origen.'
      : preview.kind === 'same-warehouse'
        ? 'Origen y destino deben ser distintos.'
        : preview.kind === 'zero'
          ? 'La cantidad debe ser mayor que cero.'
          : preview.kind === 'invalid'
            ? 'Ingresa una cantidad válida con máximo 4 decimales.'
            : null;

  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="transfer-title"
        aria-modal="true"
        className="adjustment-dialog transfer-dialog"
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow">Movimiento entre almacenes</p>
            <h2 id="transfer-title">Transferir inventario</h2>
          </div>
          <button
            aria-label="Cerrar transferencia"
            className="icon-button"
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            Cerrar
          </button>
        </header>

        {error ? (
          <div className="form-feedback" data-tone="error" role="alert">
            {error}
          </div>
        ) : null}

        <form aria-busy={submitting || loading} onSubmit={submit}>
          <label className="filter-field" htmlFor="transferProduct">
            <span>Producto</span>
            <select
              disabled={submitting || loading}
              id="transferProduct"
              onChange={(event) =>
                changeIntent(() => {
                  setProductId(event.target.value);
                  setFromWarehouseId('');
                  setToWarehouseId('');
                })
              }
              required
              value={productId}
            >
              <option value="">Selecciona un producto</option>
              {products.map(({ product }) => (
                <option key={product.id} value={product.id}>
                  {product.code} · {product.name}
                </option>
              ))}
            </select>
          </label>

          <div className="transfer-fields">
            <label className="filter-field" htmlFor="transferOrigin">
              <span>Almacén origen</span>
              <select
                disabled={submitting || !selectedProduct}
                id="transferOrigin"
                onChange={(event) =>
                  changeIntent(() => setFromWarehouseId(event.target.value))
                }
                required
                value={fromWarehouseId}
              >
                <option value="">Selecciona origen</option>
                {selectedProduct?.balances.map((balance) => (
                  <option
                    key={balance.warehouse.id}
                    value={balance.warehouse.id}
                  >
                    {balance.warehouse.name} ·{' '}
                    {formatQuantity(balance.quantity)}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field" htmlFor="transferDestination">
              <span>Almacén destino</span>
              <select
                disabled={submitting || !selectedProduct}
                id="transferDestination"
                onChange={(event) =>
                  changeIntent(() => setToWarehouseId(event.target.value))
                }
                required
                value={toWarehouseId}
              >
                <option value="">Selecciona destino</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({warehouse.code})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="filter-field" htmlFor="transferQuantity">
            <span>Cantidad</span>
            <input
              disabled={submitting}
              id="transferQuantity"
              inputMode="decimal"
              maxLength={20}
              onChange={(event) =>
                changeIntent(() => setQuantity(event.target.value))
              }
              placeholder="Ejemplo: 3"
              required
              value={quantity}
            />
          </label>
          <label className="filter-field" htmlFor="transferReason">
            <span>Motivo obligatorio</span>
            <textarea
              disabled={submitting}
              id="transferReason"
              maxLength={500}
              onChange={(event) =>
                changeIntent(() => setReason(event.target.value))
              }
              required
              rows={3}
              value={reason}
            />
          </label>

          <div
            className="adjustment-preview transfer-preview"
            data-valid={preview.kind === 'valid'}
          >
            <strong>TRANSFERENCIA</strong>
            {preview.kind === 'valid' ? (
              <dl>
                <div>
                  <dt>{origin?.warehouse.code}</dt>
                  <dd>
                    {formatQuantity(preview.originBefore)} →{' '}
                    {formatQuantity(preview.originAfter)}
                  </dd>
                </div>
                <div>
                  <dt>
                    {warehouses.find(({ id }) => id === toWarehouseId)?.code}
                  </dt>
                  <dd>
                    {formatQuantity(preview.destinationBefore)} →{' '}
                    {formatQuantity(preview.destinationAfter)}
                  </dd>
                </div>
                <div>
                  <dt>Transferencia</dt>
                  <dd>{formatQuantity(preview.quantity)}</dd>
                </div>
                <div>
                  <dt>Stock total</dt>
                  <dd>
                    {formatQuantity(preview.stockTotalBefore)} →{' '}
                    {formatQuantity(preview.stockTotalAfter)}
                  </dd>
                </div>
              </dl>
            ) : previewMessage ? (
              <p role="alert">{previewMessage}</p>
            ) : (
              <p>Selecciona producto, origen, destino y cantidad.</p>
            )}
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
              {submitting ? 'Transfiriendo…' : 'Confirmar transferencia'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
