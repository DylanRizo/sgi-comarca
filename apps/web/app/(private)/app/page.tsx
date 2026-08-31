'use client';

import type { InventoryAnalytics } from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { analyticsApi } from '@/lib/http/analytics-api';
import { useAuth } from '@/providers/auth-provider';

type LoadState =
  | { kind: 'denied' }
  | { kind: 'error' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: InventoryAnalytics };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-NI', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatMoney(value: string): string {
  return new Intl.NumberFormat('es-NI', {
    currency: 'NIO',
    style: 'currency',
  }).format(Number(value));
}

/**
 * Operational home. It answers "what needs attention today" rather than
 * describing the session: the session facts moved to the foot of the page,
 * where they belong for support, and the top of the screen now carries stock
 * health and the shortcuts to act on it.
 *
 * Hiding a card is presentation only. Every figure here comes from an endpoint
 * the backend independently authorizes.
 */
export default function AppPage() {
  const { state } = useAuth();
  const [inventory, setInventory] = useState<LoadState>({ kind: 'loading' });

  const authenticated = state.kind === 'authenticated';
  const canReadInventoryAnalytics =
    authenticated &&
    state.session.permissions.includes('analytics.read') &&
    state.session.permissions.includes('inventory.read');

  useEffect(() => {
    const controller = new AbortController();
    // Deferring the first state write keeps the effect free of a synchronous
    // setState, matching how every other view in this app loads.
    const scheduledLoad = window.setTimeout(() => {
      if (!canReadInventoryAnalytics) {
        setInventory({ kind: 'denied' });
        return;
      }
      analyticsApi
        .inventory(controller.signal)
        .then((data) => setInventory({ data, kind: 'ready' }))
        .catch(() => {
          if (!controller.signal.aborted) setInventory({ kind: 'error' });
        });
    }, 0);
    return () => {
      window.clearTimeout(scheduledLoad);
      controller.abort();
    };
  }, [canReadInventoryAnalytics]);

  if (state.kind !== 'authenticated') return null;
  const { session } = state;

  return (
    <main className="content-page" id="main-content">
      <section className="page-heading" aria-labelledby="welcome-title">
        <div>
          <p className="eyebrow">SGI La Comarca</p>
          <h1 id="welcome-title">Bienvenido, {session.displayName}</h1>
          <p>
            Resumen operativo del inventario y accesos directos a tu trabajo.
          </p>
        </div>
      </section>

      {inventory.kind === 'loading' ? (
        <p className="read-state">Cargando el estado del inventario…</p>
      ) : null}

      {inventory.kind === 'error' ? (
        <p className="read-state" data-tone="error">
          No fue posible cargar el estado del inventario.
        </p>
      ) : null}

      {inventory.kind === 'ready' ? (
        <section aria-labelledby="stock-title" className="detail-section">
          <div className="section-heading">
            <h2 id="stock-title">Estado del inventario</h2>
          </div>
          <div className="kpi-grid">
            <article className="kpi-card">
              <span className="kpi-label">Productos con saldo</span>
              <span className="kpi-value">
                {inventory.data.distinctProducts}
              </span>
              <span className="kpi-note">
                En {inventory.data.warehouses} bodegas activas
              </span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Sin existencias</span>
              <span
                className="kpi-value"
                data-tone={
                  inventory.data.outOfStockCount > 0 ? 'warning' : undefined
                }
              >
                {inventory.data.outOfStockCount}
              </span>
              <span className="kpi-note">Saldos en cero</span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Costos por revisar</span>
              <span
                className="kpi-value"
                data-tone={
                  inventory.data.costReviewCount > 0 ? 'warning' : undefined
                }
              >
                {inventory.data.costReviewCount}
              </span>
              <span className="kpi-note">Excluidos de toda valoración</span>
            </article>
            {inventory.data.totalValue === null ? null : (
              <article className="kpi-card">
                <span className="kpi-label">Valor del inventario</span>
                <span className="kpi-value">
                  {formatMoney(inventory.data.totalValue)}
                </span>
                {inventory.data.valuationCoverage &&
                inventory.data.valuationCoverage.excludedLines > 0 ? (
                  <span className="coverage-note">
                    Cubre {inventory.data.valuationCoverage.coveredLines} de{' '}
                    {inventory.data.valuationCoverage.totalLines} saldos
                  </span>
                ) : (
                  <span className="coverage-note" data-complete="true">
                    Cubre todos los saldos
                  </span>
                )}
              </article>
            )}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="session-title" className="detail-section">
        <div className="section-heading">
          <h2 id="session-title">Tu sesión</h2>
        </div>
        <dl className="session-details">
          <div>
            <dt>Usuario</dt>
            <dd>{session.identifier}</dd>
          </div>
          <div>
            <dt>Inactividad</dt>
            <dd>{formatDate(session.idleExpiresAt)}</dd>
          </div>
          <div>
            <dt>Límite absoluto</dt>
            <dd>{formatDate(session.absoluteExpiresAt)}</dd>
          </div>
        </dl>
        <section aria-labelledby="permissions-title">
          <h2 id="permissions-title">Permisos disponibles</h2>
          {session.permissions.length ? (
            <ul className="permissions-list">
              {session.permissions.map((permission) => (
                <li key={permission}>{permission}</li>
              ))}
            </ul>
          ) : (
            <p>No hay acciones disponibles.</p>
          )}
        </section>
        <div className="button-row">
          <Link
            className="secondary-link"
            href={'/account/change-password' as Route}
          >
            Cambiar contraseña
          </Link>
        </div>
      </section>
    </main>
  );
}
