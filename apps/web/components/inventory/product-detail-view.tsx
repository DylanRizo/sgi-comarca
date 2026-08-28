'use client';

import type { ProductInventoryView } from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ReadState, RetryButton } from '@/components/inventory/read-state';
import { inventoryApi } from '@/lib/http/inventory-api';
import {
  formatMoney,
  formatObservedAt,
  formatQuantity,
  latestValuation,
} from '@/lib/inventory/presentation';
import { presentReadError } from '@/lib/http/read-error';
import { useAuth } from '@/providers/auth-provider';

export function ProductDetailView({
  productId,
}: Readonly<{ productId: string }>) {
  const { refreshSession } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<ProductInventoryView | null>(null);

  useEffect(() => {
    let current = true;
    const request = window.setTimeout(() => {
      void inventoryApi
        .productInventory(productId)
        .then((result) => {
          if (!current) return;
          setError(null);
          setState(result);
        })
        .catch((requestError: unknown) => {
          if (!current) return;
          setError(requestError);
          void refreshSession().catch(() => undefined);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 0);
    return () => {
      current = false;
      window.clearTimeout(request);
    };
  }, [productId, refreshSession, reload]);

  const errorPresentation = error ? presentReadError(error) : null;

  function retry() {
    setError(null);
    setLoading(true);
    setReload((value) => value + 1);
  }

  return (
    <main className="content-page" id="main-content">
      <Link className="back-link" href={'/products' as Route}>
        ← Volver a productos
      </Link>
      {loading ? (
        <ReadState title="Cargando producto">
          <p>Consultando existencias y valoraciones…</p>
        </ReadState>
      ) : errorPresentation ? (
        <ReadState
          action={<RetryButton onRetry={retry} />}
          title={errorPresentation.title}
          tone={errorPresentation.tone}
        >
          <p>{errorPresentation.message}</p>
        </ReadState>
      ) : state ? (
        <>
          <header className="page-heading product-heading">
            <div>
              <p className="eyebrow">{state.product.code}</p>
              <h1>{state.product.name}</h1>
              <p>
                {state.product.description ?? 'Sin descripción registrada.'}
              </p>
            </div>
            <span className="status-badge" data-active={state.product.active}>
              {state.product.active ? 'Activo' : 'Inactivo'}
            </span>
          </header>

          <dl className="product-facts">
            <div>
              <dt>Unidad</dt>
              <dd>{state.product.unit?.name ?? 'Sin unidad'}</dd>
            </div>
            <div>
              <dt>Stock total</dt>
              <dd>{formatQuantity(state.totalQuantity)}</dd>
            </div>
            <div>
              <dt>Stock mínimo</dt>
              <dd>{formatQuantity(state.product.minimumStock)}</dd>
            </div>
            <div>
              <dt>Almacenes</dt>
              <dd>{state.balances.length}</dd>
            </div>
          </dl>

          <section aria-labelledby="balances-title" className="detail-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Desglose</p>
                <h2 id="balances-title">Balances por almacén</h2>
              </div>
            </div>
            {state.balances.length === 0 ? (
              <ReadState title="Sin balances">
                <p>Este producto todavía no tiene existencias registradas.</p>
              </ReadState>
            ) : (
              <div className="balance-grid">
                {state.balances.map((balance) => {
                  const valuation = latestValuation(balance);
                  return (
                    <article className="balance-card" key={balance.id}>
                      <header>
                        <div>
                          <p className="warehouse-code">
                            {balance.warehouse.code}
                          </p>
                          <h3>{balance.warehouse.name}</h3>
                        </div>
                        <strong className="balance-quantity">
                          {formatQuantity(balance.quantity)}
                        </strong>
                      </header>
                      <dl>
                        <div>
                          <dt>Costo actual</dt>
                          <dd>{formatMoney(balance.currentUnitCost)}</dd>
                        </div>
                        <div>
                          <dt>Precio actual</dt>
                          <dd>{formatMoney(balance.currentUnitPrice)}</dd>
                        </div>
                      </dl>
                      {valuation ? (
                        <div className="valuation-panel">
                          <h4>Valoración más reciente</h4>
                          <dl>
                            <div>
                              <dt>Costo</dt>
                              <dd>
                                {formatMoney(
                                  valuation.unitCost,
                                  valuation.currencyCode,
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Precio</dt>
                              <dd>
                                {formatMoney(
                                  valuation.unitPrice,
                                  valuation.currencyCode,
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Observado</dt>
                              <dd>{formatObservedAt(valuation.observedAt)}</dd>
                            </div>
                          </dl>
                        </div>
                      ) : (
                        <p className="valuation-missing">
                          Sin valoración registrada para este almacén.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
