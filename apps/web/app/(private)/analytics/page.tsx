'use client';

import type { SalesAnalytics } from '@sgi/contracts';
import { useEffect, useState } from 'react';

import { analyticsApi } from '@/lib/http/analytics-api';
import {
  ChartEmpty,
  CoverageMeter,
  PeriodChart,
  RankedBars,
  ShareDonut,
} from '@/components/analytics/charts';
import { useAuth } from '@/providers/auth-provider';

type LoadState =
  | { kind: 'error'; message: string }
  | { kind: 'loading' }
  | { kind: 'ready'; data: SalesAnalytics };

function formatMoney(value: string | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('es-NI', {
    currency: 'NIO',
    style: 'currency',
  }).format(Number(value));
}

/** A `0`–`1` ratio the API already rounded, rendered for reading. */
function percent(ratio: string): string {
  return `${(Number(ratio) * 100).toFixed(1)} %`;
}

/** Axis labels need to be short: C$ 48k reads where C$ 48,320.00 does not. */
function compactMoney(value: number): string {
  return new Intl.NumberFormat('es-NI', {
    currency: 'NIO',
    style: 'currency',
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
  }).format(value);
}

function formatPercent(ratio: string | null): string {
  if (ratio === null) return '—';
  return `${(Number(ratio) * 100).toFixed(1)} %`;
}

function isoDaysAgo(days: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export default function AnalyticsPage() {
  const { state } = useAuth();
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [granularity, setGranularity] = useState<'day' | 'month' | 'week'>(
    'day',
  );
  const [result, setResult] = useState<LoadState>({ kind: 'loading' });
  // A counter rather than a callback: the filters submit by asking for a
  // reload, which keeps the effect the single place that fetches.
  const [reload, setReload] = useState(0);
  const [applied, setApplied] = useState({ from, granularity, to });

  useEffect(() => {
    const controller = new AbortController();
    const scheduledLoad = window.setTimeout(() => {
      analyticsApi
        .sales(applied, controller.signal)
        .then((data) => setResult({ data, kind: 'ready' }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const message =
            error instanceof Error && error.message.includes('TOO_WIDE')
              ? 'El rango no puede superar un año.'
              : 'No fue posible cargar la analítica de ventas.';
          setResult({ kind: 'error', message });
        });
    }, 0);
    return () => {
      window.clearTimeout(scheduledLoad);
      controller.abort();
    };
  }, [applied, reload]);

  if (state.kind !== 'authenticated') return null;

  const data = result.kind === 'ready' ? result.data : null;
  // Money is null for an actor without `finances.read`, so the charts show the
  // operational series instead of drawing an axis of dashes.
  const showsMoney = data?.totalRevenue !== null && data?.totalRevenue !== undefined;

  return (
    <main className="content-page" id="main-content">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Analytics</p>
          <h1>Ventas y margen</h1>
          <p>
            Volumen, ingresos y utilidad del periodo. Las cifras monetarias solo
            aparecen si tu cuenta puede leer finanzas.
          </p>
        </div>
      </section>

      <form
        className="filter-bar"
        onSubmit={(event) => {
          event.preventDefault();
          setResult({ kind: 'loading' });
          setApplied({ from, granularity, to });
          setReload((current) => current + 1);
        }}
      >
        <label className="filter-field">
          <span>Desde</span>
          <input
            onChange={(event) => setFrom(event.target.value)}
            type="date"
            value={from}
          />
        </label>
        <label className="filter-field">
          <span>Hasta</span>
          <input
            onChange={(event) => setTo(event.target.value)}
            type="date"
            value={to}
          />
        </label>
        <label className="filter-field">
          <span>Agrupar por</span>
          <select
            onChange={(event) =>
              setGranularity(event.target.value as 'day' | 'month' | 'week')
            }
            value={granularity}
          >
            <option value="day">Día</option>
            <option value="week">Semana</option>
            <option value="month">Mes</option>
          </select>
        </label>
        <button className="primary-button" type="submit">
          Actualizar
        </button>
      </form>

      {result.kind === 'loading' ? (
        <p className="read-state">Calculando…</p>
      ) : null}

      {result.kind === 'error' ? (
        <p className="read-state" data-tone="error">
          {result.message}
        </p>
      ) : null}

      {data ? (
        <>
          <div className="kpi-grid">
            <article className="kpi-card">
              <span className="kpi-label">Ventas completadas</span>
              <span className="kpi-value">{data.saleCount}</span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Ingresos</span>
              <span className="kpi-value">
                {formatMoney(data.totalRevenue)}
              </span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Utilidad bruta</span>
              <span className="kpi-value">{formatMoney(data.grossProfit)}</span>
              <span className="kpi-note">
                {data.grossProfit === null && data.totalRevenue !== null
                  ? 'Ningún costo confiable en el periodo'
                  : `Costo ${formatMoney(data.cost)}`}
              </span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Ticket promedio</span>
              <span className="kpi-value">
                {formatMoney(data.averageTicket)}
              </span>
              <span className="kpi-note">
                {data.saleCount} venta(s) en el periodo
              </span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Margen</span>
              <span className="kpi-value">
                {formatPercent(data.marginRatio)}
              </span>
              {/*
                Coverage travels with the margin instead of sitting in a
                footnote: a figure computed over half the lines must not be read
                as if it covered all of them.
              */}
              <span
                className="coverage-note"
                data-complete={
                  data.marginCoverage.excludedLines === 0 ? 'true' : undefined
                }
              >
                {data.marginCoverage.totalLines === 0
                  ? 'Sin líneas en el periodo'
                  : `Cubre ${data.marginCoverage.coveredLines} de ${data.marginCoverage.totalLines} líneas`}
              </span>
            </article>
          </div>

          <section aria-labelledby="periods-title" className="detail-section">
            <div className="section-heading">
              <h2 id="periods-title">
                {showsMoney ? 'Ingresos y unidades por periodo' : 'Unidades vendidas por periodo'}
              </h2>
            </div>
            {data.periods.length === 0 ? (
              <ChartEmpty message="Sin ventas completadas en el rango." />
            ) : showsMoney ? (
              <PeriodChart
                bars={data.periods.map((point) => Number(point.revenue))}
                barLabel="Ingresos"
                formatBar={compactMoney}
                formatLine={(value) => `${String(value)} u`}
                labels={data.periods.map((point) => point.period.slice(5))}
                line={data.periods.map((point) => Number(point.unitsSold))}
                lineLabel="Unidades"
                summary={`Ingresos por periodo, con la línea de unidades vendidas. ${String(data.periods.length)} periodos.`}
              />
            ) : (
              <PeriodChart
                bars={data.periods.map((point) => Number(point.unitsSold))}
                barLabel="Unidades"
                formatBar={(value) => String(value)}
                labels={data.periods.map((point) => point.period.slice(5))}
                summary={`Unidades vendidas por periodo. ${String(data.periods.length)} periodos.`}
              />
            )}
            {data.marginCoverage.totalLines > 0 && showsMoney ? (
              <CoverageMeter
                covered={data.marginCoverage.coveredLines}
                excluded={data.marginCoverage.excludedLines}
                label="Cobertura del margen"
              />
            ) : null}
          </section>

          <section aria-labelledby="sellers-title" className="detail-section">
            <div className="section-heading">
              <h2 id="sellers-title">Vendedores</h2>
            </div>
            {data.bySeller.length === 0 ? (
              <ChartEmpty message="Sin ventas completadas en el rango." />
            ) : (
              <>
                <RankedBars
                  format={showsMoney ? compactMoney : (value) => `${String(value)} ventas`}
                  items={data.bySeller.map((seller) => ({
                    label: seller.sellerName,
                    note: `${String(seller.saleCount)} ventas`,
                    value: showsMoney ? Number(seller.revenue) : seller.saleCount,
                  }))}
                  summary={
                    showsMoney
                      ? 'Facturación acumulada por vendedor.'
                      : 'Ventas por vendedor.'
                  }
                />
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Vendedor</th>
                      <th scope="col">Ventas</th>
                      <th scope="col">Facturado</th>
                      <th scope="col">Ticket promedio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bySeller.map((seller) => (
                      <tr key={seller.sellerUserId ?? 'sin-vendedor'}>
                        <td data-label="Vendedor">{seller.sellerName}</td>
                        <td data-label="Ventas" data-numeric="true">
                          {seller.saleCount}
                        </td>
                        <td data-label="Facturado" data-numeric="true">
                          {formatMoney(seller.revenue)}
                        </td>
                        <td data-label="Ticket promedio" data-numeric="true">
                          {formatMoney(seller.averageTicket)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </section>

          <section aria-labelledby="channels-title" className="detail-section">
            <div className="section-heading">
              <h2 id="channels-title">Canales de venta</h2>
            </div>
            {data.byChannel.length === 0 ? (
              <ChartEmpty message="Sin ventas completadas en el rango." />
            ) : (
              <ShareDonut
                items={data.byChannel.map((point) => ({
                  label: point.channel,
                  share: Number(point.share),
                  value: point.saleCount,
                }))}
                summary="Reparto de las ventas por canal de origen."
              />
            )}
          </section>

          <section aria-labelledby="top-title" className="detail-section">
            <div className="section-heading">
              <h2 id="top-title">Productos más vendidos</h2>
            </div>
            {data.topProducts.length === 0 ? (
              <ChartEmpty message="Sin productos vendidos en el rango." />
            ) : (
              <RankedBars
                format={(value) => `${String(value)} u`}
                items={data.topProducts.map((point) => ({
                  label: `${point.productCode} · ${point.productName}`,
                  note: percent(point.unitsShare),
                  value: Number(point.unitsSold),
                }))}
                summary="Productos con más unidades vendidas en el periodo."
              />
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
