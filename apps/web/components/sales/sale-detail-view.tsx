'use client';

import type { SaleView } from '@sgi/contracts';
import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';

import { ReadState, RetryButton } from '@/components/inventory/read-state';
import { SaleLifecycleActions } from '@/components/sales/sale-lifecycle-actions';
import { salesApi } from '@/lib/http/sales-api';
import {
  formatMoney,
  formatObservedAt,
  formatQuantity,
} from '@/lib/inventory/presentation';
import { presentReadError } from '@/lib/inventory/read-error';
import {
  formatBusinessDate,
  paymentStatusLabel,
  saleStatusLabel,
  saleStatusTone,
} from '@/lib/sales/presentation';
import { useAuth } from '@/providers/auth-provider';

export function SaleDetailView({ saleId }: Readonly<{ saleId: string }>) {
  const { refreshSession } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [sale, setSale] = useState<SaleView | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const scheduledLoad = window.setTimeout(() => {
      salesApi
        .sale(saleId, controller.signal)
        .then((loaded) => {
          setError(null);
          setSale(loaded);
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

  const errorPresentation = error ? presentReadError(error) : null;

  return (
    <main className="content-page" id="main-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            <Link href={'/sales' as Route}>Ventas</Link>
          </p>
          <h1>{sale ? sale.saleNumber : 'Detalle de venta'}</h1>
          {sale ? (
            <p>
              {formatBusinessDate(sale.businessDate)} · {sale.items.length}{' '}
              línea{sale.items.length === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
        {sale ? (
          <span
            className="status-badge"
            data-tone={saleStatusTone(sale.status)}
          >
            {saleStatusLabel(sale.status)}
          </span>
        ) : null}
      </header>

      {loading ? (
        <ReadState title="Cargando venta">
          <p>Consultando el detalle de la venta…</p>
        </ReadState>
      ) : errorPresentation ? (
        <ReadState
          action={
            <RetryButton
              onRetry={() => {
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
          <section className="detail-grid" aria-label="Resumen de la venta">
            <div>
              <span className="detail-label">Entrega</span>
              <strong>{saleStatusLabel(sale.status)}</strong>
            </div>
            <div>
              <span className="detail-label">Pago</span>
              <strong>{paymentStatusLabel(sale.paymentStatus)}</strong>
            </div>
            <div>
              <span className="detail-label">Salida</span>
              <strong>{formatObservedAt(sale.departureAt)}</strong>
            </div>
            <div>
              <span className="detail-label">Completada</span>
              <strong>
                {sale.completedAt
                  ? formatObservedAt(sale.completedAt)
                  : 'Sin completar'}
              </strong>
            </div>
          </section>

          <div className="data-table-wrap">
            <table className="data-table sale-item-table">
              <caption className="visually-hidden">
                Líneas de la venta {sale.saleNumber}
              </caption>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Almacén</th>
                  <th>Cantidad</th>
                  <th>Precio unitario</th>
                  <th>Subtotal</th>
                  <th>Envío</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Producto">
                      <strong>{item.product.code}</strong>
                      <span>{item.product.name}</span>
                    </td>
                    <td data-label="Almacén">{item.warehouse.name}</td>
                    <td data-label="Cantidad">
                      {formatQuantity(item.quantity)}
                    </td>
                    <td data-label="Precio unitario">
                      {formatMoney(item.unitPriceSnapshot, sale.currencyCode)}
                    </td>
                    <td data-label="Subtotal">
                      {formatMoney(item.lineSubtotal, sale.currencyCode)}
                    </td>
                    <td data-label="Envío">
                      {formatMoney(item.shippingAllocation, sale.currencyCode)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="totals-panel" aria-label="Totales de la venta">
            <div>
              <span className="detail-label">Subtotal</span>
              <strong>{formatMoney(sale.subtotal, sale.currencyCode)}</strong>
            </div>
            <div>
              <span className="detail-label">Envío</span>
              <strong>
                {formatMoney(sale.shippingAmount, sale.currencyCode)}
              </strong>
            </div>
            <div className="totals-total">
              <span className="detail-label">Total</span>
              <strong>{formatMoney(sale.total, sale.currencyCode)}</strong>
            </div>
          </section>

          <SaleLifecycleActions onUpdated={setSale} sale={sale} />
        </>
      ) : null}
    </main>
  );
}
