'use client';
import type {
  ProductInventoryView,
  ProductSummary,
  ReceiptView,
  WarehouseSummary,
} from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { inventoryApi } from '@/lib/http/inventory-api';
import { stockOperationsApi } from '@/lib/http/stock-operations-api';
import { useStockMutation } from '@/lib/inventory/use-stock-mutation';
import { sumQuantity } from '@/lib/inventory/stock-form-quantity';
import { useAuth } from '@/providers/auth-provider';
import { ProductPicker } from './product-picker';
import { emptyReceipt, ReceiptFields, receiptInput } from './receipt-fields';

export function ReceiptEditor({
  productId,
  warehouseId,
}: Readonly<{ productId?: string; warehouseId?: string }>) {
  const { state: auth } = useAuth();
  const permissions =
    auth.kind === 'authenticated' ? auth.session.permissions : [];
  const [product, setProduct] = useState<ProductSummary | null>(null),
    [inventory, setInventory] = useState<ProductInventoryView | null>(null);
  const [warehouses, setWarehouses] = useState<
    readonly WarehouseSummary[] | null
  >(null);
  const [draft, setDraft] = useState({
    ...emptyReceipt,
    warehouseId: warehouseId ?? '',
  });
  const [saved, setSaved] = useState<ReceiptView | null>(null),
    [review, setReview] = useState(false);
  const [error, setError] = useState(''),
    [reload, setReload] = useState(0);
  const mutation = useStockMutation();
  useEffect(() => {
    let current = true;
    void Promise.all([
      inventoryApi.warehouses(),
      productId ? stockOperationsApi.product(productId) : Promise.resolve(null),
    ])
      .then(([result, initial]) => {
        if (current) {
          setWarehouses(result.items);
          if (initial) setProduct(initial);
          setError('');
        }
      })
      .catch(() => {
        if (current)
          setError('No pudimos cargar las bodegas o el producto. Reintenta.');
      });
    return () => {
      current = false;
    };
  }, [productId, reload]);
  useEffect(() => {
    if (!product) return;
    const controller = new AbortController();
    void inventoryApi
      .productInventory(product.id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setInventory(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            'No pudimos comprobar las existencias. Reintenta antes de guardar.',
          );
      });
    return () => controller.abort();
  }, [product, reload]);
  const readyInventory =
    inventory?.product.id === product?.id ? inventory : null;
  const before =
    readyInventory?.balances.find(
      (balance) => balance.warehouse.id === draft.warehouseId,
    )?.quantity ?? '0';
  const after = sumQuantity(before, draft.quantity);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product || !readyInventory) return;
    if (!review) {
      setReview(true);
      return;
    }
    void mutation.execute(async (key, csrf) => {
      setSaved(
        await stockOperationsApi.receive(
          { productId: product.id, ...receiptInput(draft) },
          csrf,
          key,
        ),
      );
    });
  }
  return (
    <main id="main-content" className="content-page">
      <Link className="back-link" href={'/inventory/movements' as Route}>
        Volver a Movimientos
      </Link>
      <header className="page-heading">
        <div>
          <h1>Registrar entrada</h1>
          <p>
            Agrega existencias a un producto. Cada entrada conservará su
            documento e historial.
          </p>
        </div>
        <Link
          className="secondary-button"
          href={'/inventory/receipts' as Route}
        >
          Consultar entradas
        </Link>
      </header>
      {!permissions.includes('stock-receipts.create') ? (
        <p role="alert">No tienes permiso para registrar entradas.</p>
      ) : saved ? (
        <section className="work-panel" role="status">
          <h2>Entrada registrada</h2>
          <p>
            {saved.items[0]?.product.name}: {saved.items[0]?.balanceBefore} →{' '}
            {saved.items[0]?.balanceAfter} en {saved.items[0]?.warehouse.name}.
          </p>
          <div className="operation-toolbar">
            <Link
              className="primary-button"
              href={`/inventory/receipts/${saved.id}` as Route}
            >
              Ver comprobante
            </Link>
            <button
              className="secondary-button"
              onClick={() => {
                setSaved(null);
                mutation.reset();
                setReview(false);
                setDraft((value) => ({
                  ...value,
                  quantity: '',
                  reason: '',
                  unitCost: '',
                  unitPrice: '',
                }));
                setReload((value) => value + 1);
              }}
            >
              Registrar otra entrada
            </button>
          </div>
        </section>
      ) : error ? (
        <p role="alert">
          {error}{' '}
          <button
            className="secondary-button"
            onClick={() => {
              setError('');
              setReload((value) => value + 1);
            }}
          >
            Reintentar carga
          </button>
        </p>
      ) : !warehouses ? (
        <p role="status">Cargando bodegas…</p>
      ) : (
        <form className="work-form" onSubmit={submit}>
          <fieldset disabled={mutation.busy || mutation.uncertain}>
            {!review ? (
              <>
                <ProductPicker value={product} onChange={setProduct} />
                <ReceiptFields
                  value={draft}
                  onChange={setDraft}
                  warehouses={warehouses}
                  canValue={
                    permissions.includes('inventory.valuation.manage') &&
                    permissions.includes('finances.read')
                  }
                />
              </>
            ) : (
              <section>
                <h2>Revisa la entrada</h2>
                <p>
                  <strong>
                    {product?.code} · {product?.name}
                  </strong>
                </p>
                <p>
                  {draft.quantity} en{' '}
                  {
                    warehouses.find(
                      (warehouse) => warehouse.id === draft.warehouseId,
                    )?.name
                  }
                </p>
                <p>{draft.reason}</p>
              </section>
            )}
            {product && draft.warehouseId ? (
              <div className="work-panel" aria-live="polite">
                <h3>Existencia prevista</h3>
                {readyInventory ? (
                  <p>
                    {before} + {draft.quantity || '0'} ={' '}
                    <strong>{after ?? 'Cantidad inválida'}</strong>{' '}
                    {product.unit?.name}
                  </p>
                ) : (
                  <p>Comprobando existencias…</p>
                )}
                <p>El saldo final se comprobará de nuevo al guardar.</p>
              </div>
            ) : null}
          </fieldset>
          {mutation.error ? (
            <p className="inline-error" role="alert">
              {mutation.error}
            </p>
          ) : null}
          <div className="operation-toolbar">
            {review ? (
              <button
                type="button"
                className="secondary-button"
                disabled={mutation.busy || mutation.uncertain}
                onClick={() => setReview(false)}
              >
                Editar entrada
              </button>
            ) : null}
            <button
              type="submit"
              className="primary-button"
              disabled={
                mutation.busy || !product || !readyInventory || after === null
              }
            >
              {mutation.busy
                ? 'Guardando…'
                : mutation.uncertain
                  ? 'Reintentar'
                  : review
                    ? 'Confirmar entrada'
                    : 'Revisar entrada'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
