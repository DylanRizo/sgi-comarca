'use client';

import type { SaleView } from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ReadState, RetryButton } from '@/components/inventory/read-state';
import { presentReadError } from '@/lib/http/read-error';
import { salesApi } from '@/lib/http/sales-api';
import {
  formatBusinessDate,
  formatSaleInstant,
  formatSaleMoney,
  formatSaleQuantity,
  saleOriginLabel,
  salePaymentStatusLabel,
  salePaymentStatusTone,
  saleStatusLabel,
  saleStatusTone,
} from '@/lib/sales/presentation';
import { useAuth } from '@/providers/auth-provider';

/**
 * Read-only detail of one sale.
 *
 * Cost and margin are absent by construction: the API never emits
 * `unitCostSnapshot`, and nothing here derives it from price and total.
 */
export function SaleDetailView({ saleId }: Readonly<{ saleId: string }>) {
  const { refreshSession } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [sale, setSale] = useState<SaleView | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const scheduledLoad = window.setTimeout(() => {
      void salesApi
        .detail(saleId, controller.signal)
        .then((result) => {
          setError(null);
          setSale(result);
        })
        .catch((requestError: unknown) => {
          if (controller.signal.aborted) return;
          setError(requestError);
          void refreshSession().catch(() => undefined);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(scheduledLoad);
      controller.abort();
    };
  }, [refreshSession, reload, saleId]);

  const errorPresentation = error
    ? presentReadError(error, 'sales.read')
    : null;

  return (
    <main className="content-page" id="main-content">
      <Link className="back-link" href={'/sales' as Route}>
        ← Volver a ventas
      </Link>
      {loading ? (
        <ReadState title="Cargando venta">
          <p>Consultando el detalle de la venta…</p>
        </ReadState>
      ) : errorPresentation ? (
        <ReadState
          action={
            <RetryButton
              onRetry={() => {
                setError(null);
                setLoading(true);
                setReload((value) => value + 1);
              }}
            />
          }
          title={errorPresentation.title}
          tone={errorPresentation.tone}
        >
          <p>{errorPresentation.message}</p>
        </ReadState>
      ) : sale ? (
        <>
          <header className="page-heading">
            <div>
              <p className="eyebrow">{saleOriginLabel(sale.origin)}</p>
              <h1>{sale.saleNumber}</h1>
              <p>Fecha de negocio: {formatBusinessDate(sale.businessDate)}</p>
            </div>
            <div className="sale-state-badges">
              <span
                className="status-badge"
                data-tone={saleStatusTone(sale.status)}
              >
                Entrega: {saleStatusLabel(sale.status)}
              </span>
              <span
                className="status-badge"
                data-tone={salePaymentStatusTone(sale.paymentStatus)}
              >
                Pago: {salePaymentStatusLabel(sale.paymentStatus)}
              </span>
            </div>
          </header>

          <section aria-labelledby="sale-facts" className="detail-section">
            <h2 id="sale-facts">Datos de la venta</h2>
            <dl className="sale-facts">
              <div>
                <dt>Registrada</dt>
                <dd>{formatSaleInstant(sale.createdAt)}</dd>
              </div>
              <div>
                <dt>Salida</dt>
                <dd>{formatSaleInstant(sale.departureAt)}</dd>
              </div>
              <div>
                <dt>Entregada</dt>
                <dd>{formatSaleInstant(sale.completedAt)}</dd>
              </div>
              <div>
                <dt>Vendedor</dt>
                <dd>{sale.sellerUserId ?? 'Sin vendedor asignado'}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="sale-lines">
            <h2 id="sale-lines">Líneas</h2>
            <div className="data-table-wrap">
              <table className="data-table sale-item-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Almacén</th>
                    <th>Cantidad</th>
                    <th>Precio unitario</th>
                    <th>Subtotal</th>
                    <th>Envío de la línea</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Producto">
                        <strong>{item.product.code}</strong>
                        <span>{item.product.name}</span>
                      </td>
                      <td data-label="Almacén">
                        {item.warehouse.code}
                        <span>{item.warehouse.name}</span>
                      </td>
                      <td data-label="Cantidad">
                        {formatSaleQuantity(item.quantity)}
                      </td>
                      <td data-label="Precio unitario">
                        {formatSaleMoney(
                          item.unitPriceSnapshot,
                          sale.currencyCode,
                        )}
                      </td>
                      <td data-label="Subtotal">
                        {formatSaleMoney(item.lineSubtotal, sale.currencyCode)}
                      </td>
                      <td data-label="Envío de la línea">
                        {formatSaleMoney(
                          item.shippingAllocation,
                          sale.currencyCode,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="sale-totals" className="detail-section">
            <h2 id="sale-totals">Totales</h2>
            <dl className="sale-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatSaleMoney(sale.subtotal, sale.currencyCode)}</dd>
              </div>
              <div>
                <dt>Envío</dt>
                <dd>
                  {formatSaleMoney(sale.shippingAmount, sale.currencyCode)}
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>
                  <strong>
                    {formatSaleMoney(sale.total, sale.currencyCode)}
                  </strong>
                </dd>
              </div>
            </dl>
          </section>
        </>
      ) : null}
    </main>
  );
}
