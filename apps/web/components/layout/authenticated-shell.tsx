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

export function AuthenticatedShell({
  children,
}: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const { state } = useAuth();
  if (state.kind !== 'authenticated') return null;

  const canReadInventory = state.session.permissions.includes('inventory.read');
  // Hiding the entry is navigation, not authorization: every sales request is
  // still authorized by the API against `sales.read`.
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
          {canReadSales ? (
            <Link
              aria-current={
                pathname === '/sales' || pathname.startsWith('/sales/')
                  ? 'page'
                  : undefined
              }
              href={'/sales' as Route}
            >
              Ventas
            </Link>
          ) : null}
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
