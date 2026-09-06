'use client';
import type {
  InventoryAdjustmentResult,
  ProductInventoryView,
  ProductSummary,
} from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { inventoryApi } from '@/lib/http/inventory-api';
import { useAuth } from '@/providers/auth-provider';
import {
  InventoryAdjustmentDialog,
  type InventoryAdjustmentSelection,
} from './inventory-adjustment-dialog';
import { ProductPicker } from './product-picker';

export function InventoryAdjustmentPage() {
  const { state: auth } = useAuth();
  const allowed =
    auth.kind === 'authenticated' &&
    auth.session.permissions.includes('inventory.adjust');
  const [product, setProduct] = useState<ProductSummary | null>(null);
  const [inventory, setInventory] = useState<ProductInventoryView | null>(null);
  const [selection, setSelection] =
    useState<InventoryAdjustmentSelection | null>(null);
  const [result, setResult] = useState<InventoryAdjustmentResult | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!product) {
      return;
    }
    const controller = new AbortController();
    void inventoryApi
      .productInventory(product.id, controller.signal)
      .then(setInventory)
      .catch(() => {
        if (!controller.signal.aborted)
          setError('No pudimos cargar los saldos del producto.');
      });
    return () => controller.abort();
  }, [product]);
  return (
    <main className="content-page" id="main-content">
      <Link className="back-link" href={'/inventory/movements' as Route}>
        Volver a Movimientos
      </Link>
      <header className="page-heading">
        <div>
          <h1>Ajustar existencias</h1>
          <p>
            Corrige una diferencia justificada. Para compras o reposiciones
            utiliza Registrar entrada.
          </p>
        </div>
      </header>
      {!allowed ? (
        <p role="alert">No tienes permiso para ajustar inventario.</p>
      ) : (
        <>
          <ProductPicker
            value={product}
            onChange={(value) => {
              setProduct(value);
              setInventory(null);
              setError('');
              setResult(null);
            }}
          />
          {error ? (
            <p role="alert">{error}</p>
          ) : product && !inventory ? (
            <p role="status">Consultando saldos…</p>
          ) : inventory?.balances.length === 0 ? (
            <section className="work-panel">
              <h2>Sin saldo en bodegas</h2>
              <p>
                Este producto aún no tiene un balance que corregir. Registra una
                entrada primero.
              </p>
            </section>
          ) : inventory ? (
            <section className="work-panel">
              <h2>Selecciona la bodega</h2>
              <div className="picker-results">
                {inventory.balances.map((balance) => (
                  <button
                    key={balance.id}
                    className="picker-result"
                    type="button"
                    onClick={() =>
                      setSelection({ product: inventory.product, balance })
                    }
                  >
                    <strong>{balance.warehouse.name}</strong>
                    <span>Saldo actual: {balance.quantity}</span>
                    <span>Ajustar</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {result ? (
            <section className="work-panel" role="status">
              <h2>Ajuste registrado</h2>
              <p>
                {result.balanceBefore} → {result.balanceAfter}. El movimiento
                quedó en el historial.
              </p>
              <Link
                className="table-link"
                href={'/inventory/movements' as Route}
              >
                Ver movimientos
              </Link>
            </section>
          ) : null}
        </>
      )}
      {selection ? (
        <InventoryAdjustmentDialog
          selection={selection}
          onCancel={() => setSelection(null)}
          onSuccess={(value) => {
            setSelection(null);
            setResult(value);
            if (product)
              void inventoryApi.productInventory(product.id).then(setInventory);
          }}
        />
      ) : null}
    </main>
  );
}
