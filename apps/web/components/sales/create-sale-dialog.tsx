'use client';

import type {
  ProductInventoryView,
  SaleCreationStatus,
  SaleView,
  WarehouseSummary,
} from '@sgi/contracts';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { inventoryApi } from '@/lib/http/inventory-api';
import { salesApi } from '@/lib/http/sales-api';
import { formatMoney, formatQuantity } from '@/lib/inventory/presentation';
import {
  previewSaleDraft,
  saleDraftIssueMessage,
  type SaleDraftLine,
} from '@/lib/sales/create-sale-draft';
import { useAuth } from '@/providers/auth-provider';
import { useModalDialog } from '@/lib/use-modal-dialog';

function createSaleError(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'SALE_INSUFFICIENT_STOCK') {
      return 'El stock cambió y ya no alcanza. Actualiza los datos antes de intentarlo de nuevo.';
    }
    if (error.code === 'SALE_BALANCE_NOT_FOUND') {
      return 'Algún producto no tiene saldo en el almacén elegido. Corrige esa línea.';
    }
    if (error.code === 'SALE_COST_MISSING') {
      return 'Un producto no tiene costo registrado en ese almacén. Regístralo antes de vender.';
    }
    if (error.code === 'SALE_PRICE_MISSING') {
      return 'Un producto no tiene precio de referencia. Escribe un precio en esa línea.';
    }
    if (error.code === 'IDEMPOTENCY_KEY_REUSED') {
      return 'La venta cambió durante el envío. Cierra el formulario y vuelve a iniciarla.';
    }
    if (error.status === 401) return 'La sesión ya no es válida.';
    if (error.status === 403) return 'No tienes permiso para registrar ventas.';
    if (error.status === 409) {
      return 'La venta entró en conflicto con otro cambio de inventario. Actualiza los datos.';
    }
    if (error.status === 422) {
      return 'Alguna línea no es vendible con los datos actuales. Revísala.';
    }
    if (error.status === 400) return 'Revisa la fecha, las líneas y el envío.';
  }
  return 'No fue posible registrar la venta. No se reintentará automáticamente.';
}

const emptyLine: SaleDraftLine = {
  productId: '',
  quantity: '',
  unitPrice: '',
  warehouseId: '',
};

/** The business date is a civil date in the operating timezone. */
function todayInManagua(): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Managua',
    year: 'numeric',
  }).format(new Date());
}

export function CreateSaleDialog({
  onCancel,
  onSuccess,
}: Readonly<{
  onCancel: () => void;
  onSuccess: (sale: SaleView) => void;
}>) {
  const { getCsrfToken } = useAuth();
  const submissionRef = useRef(false);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const [businessDate, setBusinessDate] = useState(todayInManagua);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<readonly SaleDraftLine[]>([emptyLine]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<readonly ProductInventoryView[]>([]);
  const [shippingAmount, setShippingAmount] = useState('');
  const [status, setStatus] = useState<SaleCreationStatus>('IN_TRANSIT');
  const [submitting, setSubmitting] = useState(false);
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
        if (!controller.signal.aborted) setError(createSaleError(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const availableByPair = new Map<string, string>();
  const referencePriceByPair = new Map<string, string | null>();
  for (const inventory of products) {
    for (const balance of inventory.balances) {
      const pair = [inventory.product.id, balance.warehouse.id].join(':');
      availableByPair.set(pair, balance.quantity);
      referencePriceByPair.set(pair, balance.currentUnitPrice);
    }
  }

  const preview = previewSaleDraft(
    { businessDate, lines, shippingAmount, status },
    availableByPair,
    referencePriceByPair,
  );
  const canSubmit = preview.kind === 'valid' && !submitting && !loading;

  /** Any change is a new intent, so it gets a fresh idempotency key. */
  function changeIntent(action: () => void) {
    action();
    setError(null);
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  function updateLine(index: number, patch: Partial<SaleDraftLine>) {
    changeIntent(() =>
      setLines((current) =>
        current.map((line, position) =>
          position === index ? { ...line, ...patch } : line,
        ),
      ),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || preview.kind !== 'valid' || submissionRef.current) return;
    submissionRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const sale = await salesApi.create(
        preview.request,
        await getCsrfToken(),
        idempotencyKeyRef.current,
      );
      idempotencyKeyRef.current = crypto.randomUUID();
      onSuccess(sale);
    } catch (submissionError) {
      setError(createSaleError(submissionError));
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  const issueMessage =
    preview.kind === 'invalid' && lines.some((line) => line.productId)
      ? saleDraftIssueMessage(preview.issue)
      : null;

  // FASE 10B. Escape, focus trap and focus restoration for this
  // aria-modal dialog; disabled while a submission is in flight, matching
  // the close control.
  const dialogRef = useModalDialog<HTMLElement>(onCancel, !submitting);

  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="create-sale-title"
        aria-modal="true"
        className="adjustment-dialog sale-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <h2 id="create-sale-title">Registrar venta</h2>
          <p>
            El servidor calcula precios y totales y asigna el número de venta.
            El pago siempre queda pendiente al registrar.
          </p>
        </header>

        {loading ? (
          <p>Cargando productos y almacenes…</p>
        ) : (
          <form onSubmit={submit}>
            <div className="sale-form-grid">
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
              <label className="filter-field">
                <span>Entrega</span>
                <select
                  onChange={(event) =>
                    changeIntent(() =>
                      setStatus(event.target.value as SaleCreationStatus),
                    )
                  }
                  value={status}
                >
                  <option value="IN_TRANSIT">En tránsito</option>
                  <option value="COMPLETED">Completada</option>
                </select>
              </label>
              <label className="filter-field">
                <span>Envío (C$)</span>
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    changeIntent(() => setShippingAmount(event.target.value))
                  }
                  placeholder="0.00"
                  value={shippingAmount}
                />
              </label>
            </div>

            <fieldset className="sale-lines">
              <legend>Líneas</legend>
              {lines.map((line, index) => {
                const pair = [line.productId, line.warehouseId].join(':');
                const stock = availableByPair.get(pair);
                const reference = referencePriceByPair.get(pair) ?? null;
                return (
                  <div className="sale-line" key={index}>
                    <label>
                      <span>Producto</span>
                      <select
                        onChange={(event) =>
                          updateLine(index, { productId: event.target.value })
                        }
                        value={line.productId}
                      >
                        <option value="">Selecciona…</option>
                        {products.map(({ product }) => (
                          <option key={product.id} value={product.id}>
                            {product.code} · {product.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Almacén</span>
                      <select
                        onChange={(event) =>
                          updateLine(index, { warehouseId: event.target.value })
                        }
                        value={line.warehouseId}
                      >
                        <option value="">Selecciona…</option>
                        {warehouses.map((warehouse) => (
                          <option key={warehouse.id} value={warehouse.id}>
                            {warehouse.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Cantidad</span>
                      <input
                        inputMode="decimal"
                        onChange={(event) =>
                          updateLine(index, { quantity: event.target.value })
                        }
                        value={line.quantity}
                      />
                    </label>
                    <label>
                      <span>Precio (opcional)</span>
                      <input
                        inputMode="decimal"
                        onChange={(event) =>
                          updateLine(index, { unitPrice: event.target.value })
                        }
                        placeholder={reference ?? 'Sin referencia'}
                        value={line.unitPrice}
                      />
                    </label>
                    <p className="sale-line-hint">
                      {line.productId && line.warehouseId
                        ? stock
                          ? 'Disponible: ' + formatQuantity(stock)
                          : 'Sin saldo en ese almacén'
                        : 'Selecciona producto y almacén'}
                    </p>
                    {lines.length > 1 ? (
                      <button
                        className="secondary-button"
                        onClick={() =>
                          changeIntent(() =>
                            setLines((current) =>
                              current.filter(
                                (_, position) => position !== index,
                              ),
                            ),
                          )
                        }
                        type="button"
                      >
                        Quitar línea
                      </button>
                    ) : null}
                  </div>
                );
              })}
              <button
                className="secondary-button"
                onClick={() =>
                  changeIntent(() =>
                    setLines((current) => [...current, emptyLine]),
                  )
                }
                type="button"
              >
                Agregar línea
              </button>
            </fieldset>

            {preview.kind === 'valid' ? (
              <div
                className="adjustment-preview"
                data-valid="true"
                role="status"
              >
                Estimado: {formatMoney(preview.estimatedTotal)} con envío
                incluido. El servidor recalcula y su resultado es el definitivo.
              </div>
            ) : issueMessage ? (
              <div className="form-feedback" data-tone="warning" role="status">
                {issueMessage}
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
                {submitting ? 'Registrando…' : 'Registrar venta'}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
