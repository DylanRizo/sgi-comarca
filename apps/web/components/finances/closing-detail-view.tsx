'use client';

import type { DailyClosingView } from '@sgi/contracts';
import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';

import { ReadState, RetryButton } from '@/components/inventory/read-state';
import { ClosingReopenAction } from '@/components/finances/closing-reopen-action';
import { closingsApi } from '@/lib/http/finances-api';
import { formatMoney, formatObservedAt } from '@/lib/inventory/presentation';
import { presentReadError } from '@/lib/inventory/read-error';
import {
  closingStatusLabel,
  closingStatusTone,
  formatBusinessDate,
} from '@/lib/finances/presentation';
import { useAuth } from '@/providers/auth-provider';

export function ClosingDetailView({
  closingId,
}: Readonly<{ closingId: string }>) {
  const { refreshSession } = useAuth();
  const [closing, setClosing] = useState<DailyClosingView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const scheduledLoad = window.setTimeout(() => {
      closingsApi
        .closing(closingId, controller.signal)
        .then((loaded) => {
          setError(null);
          setClosing(loaded);
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
  }, [closingId, refreshSession, reload]);

  const errorPresentation = error ? presentReadError(error) : null;

  return (
    <main className="content-page" id="main-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            <Link href={'/closings' as Route}>Cierres</Link>
          </p>
          <h1>
            {closing ? formatBusinessDate(closing.businessDate) : 'Cierre'}
          </h1>
        </div>
        {closing ? (
          <span
            className="status-badge"
            data-tone={closingStatusTone(closing.status)}
          >
            {closingStatusLabel(closing.status)}
          </span>
        ) : null}
      </header>

      {loading ? (
        <ReadState title="Cargando cierre">
          <p>Consultando el detalle del cierre…</p>
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
      ) : closing ? (
        <>
          <section className="detail-grid" aria-label="Resumen del cierre">
            <div>
              <span className="detail-label">Cuadre</span>
              <strong>{closing.balanced ? 'Cuadrado' : 'Descuadrado'}</strong>
            </div>
            <div>
              <span className="detail-label">Tolerancia aplicada</span>
              <strong>
                {formatMoney(closing.toleranceApplied, closing.currencyCode)}
              </strong>
            </div>
            <div>
              <span className="detail-label">Ventas en tránsito</span>
              <strong>{closing.inTransitSaleCount}</strong>
            </div>
            <div>
              {/* "Fecha de cierre", not "Cerrado": that word is reserved for
                  the status badge above and must not repeat with a
                  different meaning on the same page. */}
              <span className="detail-label">Fecha de cierre</span>
              <strong>{formatObservedAt(closing.closedAt)}</strong>
            </div>
          </section>

          <section className="totals-panel" aria-label="Montos del cierre">
            <div>
              <span className="detail-label">Efectivo contado</span>
              <strong>
                {formatMoney(closing.realCash, closing.currencyCode)}
              </strong>
            </div>
            <div>
              <span className="detail-label">Digital contado</span>
              <strong>
                {formatMoney(closing.realDigital, closing.currencyCode)}
              </strong>
            </div>
            <div>
              <span className="detail-label">Ventas del sistema</span>
              <strong>
                {formatMoney(closing.systemSales, closing.currencyCode)}
              </strong>
            </div>
            <div className="totals-total">
              <span className="detail-label">Diferencia</span>
              <strong>
                {formatMoney(closing.difference, closing.currencyCode)}
              </strong>
            </div>
          </section>

          {closing.observations ? (
            <p className="field-help">Observaciones: {closing.observations}</p>
          ) : null}

          {closing.reopenings.length > 0 ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <caption className="visually-hidden">
                  Historial de reaperturas
                </caption>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {closing.reopenings.map((reopening) => (
                    <tr key={reopening.id}>
                      <td data-label="Fecha">
                        {formatObservedAt(reopening.reopenedAt)}
                      </td>
                      <td data-label="Motivo">{reopening.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <ClosingReopenAction closing={closing} onUpdated={setClosing} />
        </>
      ) : null}
    </main>
  );
}
