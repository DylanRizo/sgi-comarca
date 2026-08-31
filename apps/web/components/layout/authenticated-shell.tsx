'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { LogoutButton } from '@/components/auth/logout-button';
import { useAuth } from '@/providers/auth-provider';

const inventoryNavigation = [
  { href: '/products', label: 'Productos' },
  { href: '/inventory', label: 'Inventario' },
  { href: '/inventory/movements', label: 'Movimientos' },
] as const;

// Physical counts sit behind their own capability, unlike the inventory reads
// above, so they are filtered separately (FASE 9C).
const countNavigation = [
  {
    href: '/inventory/counts',
    label: 'Conteos',
    permission: 'inventory.audit.create',
  },
] as const;

const salesNavigation = [{ href: '/sales', label: 'Ventas' }] as const;

const financesNavigation = [
  { href: '/finances', label: 'Finanzas', permission: 'finances.read' },
  { href: '/closings', label: 'Cierres', permission: 'closings.read' },
] as const;

// FASE 9C. Each entry declares the permission the backend already enforces;
// hiding a link is presentation only.
const insightNavigation = [
  { href: '/reports', label: 'Reportes', permission: 'reports.read' },
  { href: '/analytics', label: 'Analytics', permission: 'analytics.read' },
] as const;

export function AuthenticatedShell({
  children,
}: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const { state } = useAuth();
  if (state.kind !== 'authenticated') return null;

  const canReadInventory = state.session.permissions.includes('inventory.read');
  // Hiding a link is presentation only; the backend authorizes every request.
  const canReadSales = state.session.permissions.includes('sales.read');

  return (
    <div className="application-shell">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <header className="application-header">
        <Link className="brand-link" href={'/app' as Route}>
          <span>SGI La Comarca</span>
          <small>Gestión operativa</small>
        </Link>
        <nav aria-label="Navegación principal" className="application-nav">
          <Link
            aria-current={pathname === '/app' ? 'page' : undefined}
            href={'/app' as Route}
          >
            Inicio
          </Link>
          {canReadInventory
            ? inventoryNavigation.map(({ href, label }) => (
                <Link
                  aria-current={
                    pathname === href ||
                    (href !== '/inventory' && pathname.startsWith(`${href}/`))
                      ? 'page'
                      : undefined
                  }
                  href={href as Route}
                  key={href}
                >
                  {label}
                </Link>
              ))
            : null}
          {canReadSales
            ? salesNavigation.map(({ href, label }) => (
                <Link
                  aria-current={
                    pathname === href || pathname.startsWith(`${href}/`)
                      ? 'page'
                      : undefined
                  }
                  href={href as Route}
                  key={href}
                >
                  {label}
                </Link>
              ))
            : null}
          {[...countNavigation, ...financesNavigation, ...insightNavigation]
            .filter(({ permission }) =>
              state.session.permissions.includes(permission),
            )
            .map(({ href, label }) => (
              <Link
                aria-current={
                  pathname === href || pathname.startsWith(`${href}/`)
                    ? 'page'
                    : undefined
                }
                href={href as Route}
                key={href}
              >
                {label}
              </Link>
            ))}
        </nav>
        <div className="application-user">
          <span>{state.session.displayName}</span>
          <LogoutButton />
        </div>
      </header>
      <div className="application-content">{children}</div>
    </div>
  );
}
