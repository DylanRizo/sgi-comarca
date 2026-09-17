'use client';
import type {
  ProductDetail,
  ProductGroupView,
  ProductInput,
  UnitSummary,
  WarehouseSummary,
} from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { FormField } from '@/components/ui/form-field';
import { CategoryCreator } from './category-creator';
import { stockOperationsApi } from '@/lib/http/stock-operations-api';
import { inventoryApi } from '@/lib/http/inventory-api';
import { useStockMutation } from '@/lib/inventory/use-stock-mutation';
import { useAuth } from '@/providers/auth-provider';
import { emptyReceipt, ReceiptFields, receiptInput } from './receipt-fields';

const emptyProduct: ProductInput = {
  code: '',
  name: '',
  unitId: '',
  groupId: '',
  description: '',
  minimumStock: '0',
};
export function ProductEditor({ productId }: Readonly<{ productId?: string }>) {
  const router = useRouter(),
    { state: auth } = useAuth();
  const permissions =
    auth.kind === 'authenticated' ? auth.session.permissions : [];
  const canValue =
    permissions.includes('inventory.valuation.manage') &&
    permissions.includes('finances.read');
  const [product, setProduct] = useState<ProductInput>(emptyProduct),
    [original, setOriginal] = useState<ProductDetail | null>(null);
  const [receipt, setReceipt] = useState(emptyReceipt),
    [withReceipt, setWithReceipt] = useState(false),
    [step, setStep] = useState(0);
  const [catalogs, setCatalogs] = useState<{
    units: readonly UnitSummary[];
    groups: ProductGroupView[];
    warehouses: readonly WarehouseSummary[];
  } | null>(null);
  const [loadError, setLoadError] = useState(''),
    [reload, setReload] = useState(0),
    [history, setHistory] = useState(false);
  const mutation = useStockMutation();
  useEffect(() => {
    let current = true;
    void Promise.all([
      stockOperationsApi.units(),
      stockOperationsApi.groups(),
      inventoryApi.warehouses(),
      productId ? stockOperationsApi.product(productId) : Promise.resolve(null),
      productId
        ? inventoryApi.productInventory(productId)
        : Promise.resolve(null),
    ])
      .then(([units, groups, warehouses, existing, inventory]) => {
        if (!current) return;
        setLoadError('');
        setCatalogs({
          units: units.items,
          groups,
          warehouses: warehouses.items,
        });
        setHistory((inventory?.balances.length ?? 0) > 0);
        if (existing) {
          setOriginal(existing);
          setProduct({
            code: existing.code,
            name: existing.name,
            unitId: existing.unit?.id ?? '',
            groupId: existing.group?.id ?? '',
            description: existing.description ?? '',
            minimumStock: existing.minimumStock,
          });
        } else
          setProduct((value) => ({
            ...value,
            groupId: groups.find((group) => group.code === 'GENERAL')?.id ?? '',
            unitId:
              units.items.find((unit) => unit.code === 'UNIDADES')?.id ?? '',
          }));
      })
      .catch(() => {
        if (current)
          setLoadError(
            'No pudimos cargar los catálogos. Reintenta para continuar.',
          );
      });
    return () => {
      current = false;
    };
  }, [productId, reload]);
  const edit = (field: keyof ProductInput, value: string) =>
    setProduct((previous) => ({ ...previous, [field]: value }));
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 2 && !productId) {
      setStep(step + 1);
      return;
    }
    void mutation.execute(async (key, csrf) => {
      const result =
        productId && original
          ? await stockOperationsApi.editProduct(
              productId,
              { ...product, expectedUpdatedAt: original.updatedAt },
              csrf,
              key,
            )
          : (
              await stockOperationsApi.createProduct(
                {
                  ...product,
                  ...(withReceipt
                    ? { initialReceipt: receiptInput(receipt) }
                    : {}),
                },
                csrf,
                key,
              )
            ).product;
      router.push(`/products/${result.id}` as Route);
    });
  }
  return (
    <main id="main-content" className="content-page">
      <Link href={'/products' as Route} className="back-link">
        Volver a productos
      </Link>
      <header className="page-heading">
        <div>
          <h1>{productId ? 'Editar producto' : 'Nuevo producto'}</h1>
          <p>
            {productId
              ? 'La ficha no cambia las existencias ni los documentos anteriores.'
              : 'Crea la ficha y, si ya tienes existencias, registra su primera entrada.'}
          </p>
        </div>
      </header>
      {!permissions.includes('products.manage') ? (
        <p role="alert">No tienes permiso para gestionar productos.</p>
      ) : loadError ? (
        <p role="alert">
          {loadError}{' '}
          <button
            className="secondary-button"
            onClick={() => setReload((value) => value + 1)}
          >
            Reintentar
          </button>
        </p>
      ) : !catalogs ? (
        <p role="status">Cargando catálogos…</p>
      ) : !catalogs.units.length || !catalogs.groups.length ? (
        <p role="alert">
          Los catálogos de unidades y categorías aún no están preparados. El
          administrador debe completar la preparación del entorno; tus productos
          no se importarán automáticamente.
        </p>
      ) : (
        <>
          {!productId ? (
            <ol className="workflow-steps" aria-label="Pasos de alta">
              {[
                'Producto',
                'Entrada inicial opcional',
                'Revisar y guardar',
              ].map((label, index) => (
                <li
                  key={label}
                  aria-current={step === index ? 'step' : undefined}
                >
                  {index + 1}. {label}
                </li>
              ))}
            </ol>
          ) : null}
          <form className="work-form" onSubmit={save}>
            <fieldset disabled={mutation.busy || mutation.uncertain}>
              {step === 0 ? (
                <div className="form-grid">
                  <FormField
                    label="Código"
                    hint={
                      history
                        ? 'Bloqueado porque el producto tiene historial.'
                        : 'Se guardará en mayúsculas y sin espacios al inicio o al final.'
                    }
                  >
                    <input
                      required
                      maxLength={64}
                      readOnly={history}
                      value={product.code}
                      onChange={(event) => edit('code', event.target.value)}
                    />
                  </FormField>
                  <FormField label="Nombre del producto">
                    <input
                      required
                      minLength={2}
                      maxLength={200}
                      value={product.name}
                      onChange={(event) => edit('name', event.target.value)}
                    />
                  </FormField>
                  <FormField label="Unidad de medida">
                    <select
                      required
                      disabled={history}
                      value={product.unitId}
                      onChange={(event) => edit('unitId', event.target.value)}
                    >
                      <option value="">Selecciona una unidad</option>
                      {catalogs.units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Categoría">
                    <select
                      required
                      value={product.groupId}
                      onChange={(event) => edit('groupId', event.target.value)}
                    >
                      <option value="">Selecciona una categoría</option>
                      {catalogs.groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <CategoryCreator
                      onCreated={(group) => {
                        setCatalogs((current) =>
                          current
                            ? { ...current, groups: [...current.groups, group] }
                            : current,
                        );
                        edit('groupId', group.id);
                      }}
                    />
                  </FormField>
                  <FormField label="Stock mínimo">
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.0001"
                      value={product.minimumStock}
                      onChange={(event) =>
                        edit('minimumStock', event.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Descripción (opcional)">
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={product.description ?? ''}
                      onChange={(event) =>
                        edit('description', event.target.value)
                      }
                    />
                  </FormField>
                </div>
              ) : step === 1 ? (
                <>
                  <h2>¿Quieres registrar existencias ahora?</h2>
                  {permissions.includes('stock-receipts.create') ? (
                    <label className="check-field">
                      <input
                        type="checkbox"
                        checked={withReceipt}
                        onChange={(event) =>
                          setWithReceipt(event.target.checked)
                        }
                      />{' '}
                      Registrar una entrada inicial
                    </label>
                  ) : (
                    <p>
                      Tu permiso permite crear la ficha; otra persona registrará
                      la entrada.
                    </p>
                  )}
                  {withReceipt ? (
                    <ReceiptFields
                      value={receipt}
                      onChange={setReceipt}
                      warehouses={catalogs.warehouses}
                      canValue={canValue}
                    />
                  ) : (
                    <p>
                      Se guardará únicamente la ficha del producto, sin crear
                      saldos ni movimientos.
                    </p>
                  )}
                </>
              ) : (
                <section aria-label="Resumen del producto">
                  <h2>Revisa antes de guardar</h2>
                  <dl className="product-facts">
                    <div>
                      <dt>Código</dt>
                      <dd>{product.code.trim().toUpperCase()}</dd>
                    </div>
                    <div>
                      <dt>Producto</dt>
                      <dd>{product.name}</dd>
                    </div>
                    <div>
                      <dt>Unidad</dt>
                      <dd>
                        {
                          catalogs.units.find(
                            (unit) => unit.id === product.unitId,
                          )?.name
                        }
                      </dd>
                    </div>
                    <div>
                      <dt>Categoría</dt>
                      <dd>
                        {
                          catalogs.groups.find(
                            (group) => group.id === product.groupId,
                          )?.name
                        }
                      </dd>
                    </div>
                    <div>
                      <dt>Stock mínimo</dt>
                      <dd>{product.minimumStock}</dd>
                    </div>
                  </dl>
                  {withReceipt ? (
                    <div className="work-panel">
                      <h3>Entrada inicial</h3>
                      <p>
                        {receipt.quantity} unidades en{' '}
                        {
                          catalogs.warehouses.find(
                            (warehouse) => warehouse.id === receipt.warehouseId,
                          )?.name
                        }
                        . Existencia: 0 → {receipt.quantity}.
                      </p>
                      <p>{receipt.reason}</p>
                      {canValue ? (
                        <p>
                          Costo: {receipt.unitCost || 'Pendiente'} · Precio:{' '}
                          {receipt.unitPrice || 'Pendiente'}
                        </p>
                      ) : null}
                      <p>La ficha y la entrada se guardarán juntas.</p>
                    </div>
                  ) : (
                    <p>
                      Sin entrada inicial. Puedes registrar existencias después.
                    </p>
                  )}
                </section>
              )}
            </fieldset>
            {mutation.error ? (
              <p className="inline-error" role="alert">
                {mutation.error}
              </p>
            ) : null}
            <div className="operation-toolbar">
              {step > 0 ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={mutation.busy || mutation.uncertain}
                  onClick={() => setStep(step - 1)}
                >
                  Atrás
                </button>
              ) : null}
              <button
                type="submit"
                className="primary-button"
                disabled={mutation.busy}
              >
                {mutation.busy
                  ? 'Guardando…'
                  : mutation.uncertain
                    ? 'Reintentar'
                    : productId
                      ? 'Guardar cambios'
                      : step < 2
                        ? 'Continuar'
                        : withReceipt
                          ? 'Guardar producto y entrada'
                          : 'Guardar producto'}
              </button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
