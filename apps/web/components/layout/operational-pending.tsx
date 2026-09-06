'use client';
import type { InventoryCountSessionSummary, SaleView } from '@sgi/contracts';
import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { inventoryCountsApi } from '@/lib/http/inventory-counts-api';
import { salesApi } from '@/lib/http/sales-api';
import { useAuth } from '@/providers/auth-provider';

export function OperationalPending() {
  const { state } = useAuth();
  const [sales, setSales] = useState<readonly SaleView[] | null>(null);
  const [counts, setCounts] = useState<
    readonly InventoryCountSessionSummary[] | null
  >(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const permissions =
    state.kind === 'authenticated' ? state.session.permissions : [];
  const canSales = permissions.includes('sales.read');
  const canCounts = permissions.some((permission) =>
    ['inventory.audit.create', 'inventory.audit.approve'].includes(permission),
  );
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      canSales
        ? salesApi
            .sales({ status: 'IN_TRANSIT', pageSize: 5 }, controller.signal)
            .then((result) => setSales(result.items))
        : Promise.resolve(),
      canCounts
        ? Promise.all([
            inventoryCountsApi.list(
              { pageSize: 25, status: 'OPEN' },
              controller.signal,
            ),
            inventoryCountsApi.list(
              { pageSize: 25, status: 'PENDING_APPROVAL' },
              controller.signal,
            ),
          ]).then(([open, pending]) =>
            setCounts([...open.items, ...pending.items]),
          )
        : Promise.resolve(),
    ]).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [canSales, canCounts, retry]);
  if (!canSales && !canCounts) return null;
  return (
    <section className="detail-section">
      <h2>Trabajo pendiente</h2>
      {error ? (
        <p role="alert">
          No fue posible consultar los pendientes.{' '}
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setError(false);
              setRetry((value) => value + 1);
            }}
          >
            Reintentar
          </button>
        </p>
      ) : null}
      <div className="form-grid">
        {canSales ? (
          <section className="work-panel">
            <h3>Ventas en tránsito</h3>
            {sales === null ? (
              <p>Cargando ventas…</p>
            ) : sales.length === 0 ? (
              <p>No hay ventas en tránsito.</p>
            ) : (
              <ul>
                {sales.map((sale) => (
                  <li key={sale.id}>
                    <Link href={`/sales/${sale.id}` as Route}>
                      {sale.saleNumber}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link className="table-link" href="/sales">
              Consultar ventas
            </Link>
          </section>
        ) : null}
        {canCounts ? (
          <section className="work-panel">
            <h3>Conteos en curso</h3>
            {counts === null ? (
              <p>Cargando conteos…</p>
            ) : counts.length === 0 ? (
              <p>No hay conteos pendientes.</p>
            ) : (
              <ul>
                {counts
                  .filter((count) =>
                    ['OPEN', 'PENDING_APPROVAL'].includes(count.status),
                  )
                  .map((count) => (
                    <li key={count.id}>
                      <Link href={`/inventory/counts/${count.id}` as Route}>
                        {count.reason}
                      </Link>{' '}
                      · {count.status === 'OPEN' ? 'En curso' : 'Por aprobar'}
                    </li>
                  ))}
              </ul>
            )}
            <Link className="table-link" href={'/inventory/counts' as Route}>
              Consultar todos los conteos
            </Link>
          </section>
        ) : null}
      </div>
    </section>
  );
}
