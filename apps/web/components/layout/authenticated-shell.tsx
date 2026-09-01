'use client';

import {
  ArrowLeftRight,
  Boxes,
  CalendarCheck,
  ChartColumn,
  ClipboardList,
  FileText,
  House,
  Menu,
  Package,
  ShoppingCart,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { LogoutButton } from '@/components/auth/logout-button';
import { useAuth } from '@/providers/auth-provider';

/**
 * FASE 10A. Icons are decorative: every link keeps its visible text, and the
 * glyph is hidden from assistive technology, so the accessible name is
 * unchanged and the Playwright suite keeps selecting on the same labels
 * (ADR-012).
 */
function NavIcon({ icon: Icon }: Readonly<{ icon: LucideIcon }>) {
  return <Icon aria-hidden="true" className="nav-icon" size={17} />;
}

const inventoryNavigation = [
  { href: '/products', icon: Package, label: 'Productos' },
  { href: '/inventory', icon: Boxes, label: 'Inventario' },
  { href: '/inventory/movements', icon: ArrowLeftRight, label: 'Movimientos' },
] as const;

// Physical counts sit behind their own capability, unlike the inventory reads
// above, so they are filtered separately (FASE 9C).
const countNavigation = [
  {
    href: '/inventory/counts',
    icon: ClipboardList,
    label: 'Conteos',
    permission: 'inventory.audit.create',
  },
] as const;

const salesNavigation = [
  { href: '/sales', icon: ShoppingCart, label: 'Ventas' },
] as const;

const financesNavigation = [
  {
    href: '/finances',
    icon: Wallet,
    label: 'Finanzas',
    permission: 'finances.read',
  },
  {
    href: '/closings',
    icon: CalendarCheck,
    label: 'Cierres',
    permission: 'closings.read',
  },
] as const;

// FASE 9C. Each entry declares the permission the backend already enforces;
// hiding a link is presentation only.
const insightNavigation = [
  {
    href: '/reports',
    icon: FileText,
    label: 'Reportes',
    permission: 'reports.read',
  },
  {
    href: '/analytics',
    icon: ChartColumn,
    label: 'Analytics',
    permission: 'analytics.read',
  },
] as const;

export function AuthenticatedShell({
  children,
}: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const { state } = useAuth();
  // FASE 10A. Declared before the early return below so the hook order stays
  // stable regardless of authentication state.
  const [menuOpen, setMenuOpen] = useState(false);
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
        <button
          aria-controls="primary-navigation"
          aria-expanded={menuOpen}
          className="nav-toggle"
          onClick={() => {
            setMenuOpen((open) => !open);
          }}
          type="button"
        >
          {menuOpen ? (
            <X aria-hidden="true" size={18} />
          ) : (
            <Menu aria-hidden="true" size={18} />
          )}
          {menuOpen ? 'Cerrar menú' : 'Menú'}
        </button>
        <nav
          aria-label="Navegación principal"
          className="application-nav"
          data-open={menuOpen ? 'true' : 'false'}
          id="primary-navigation"
          // Following a link must not leave the panel covering the page it
          // opened. Handled on the container so every link closes it without
          // an effect that would re-render on each navigation.
          onClick={() => {
            setMenuOpen(false);
          }}
        >
          <Link
            aria-current={pathname === '/app' ? 'page' : undefined}
            href={'/app' as Route}
          >
            <NavIcon icon={House} />
            Inicio
          </Link>
          {canReadInventory
            ? inventoryNavigation.map(({ href, icon, label }) => (
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
                  <NavIcon icon={icon} />
                  {label}
                </Link>
              ))
            : null}
          {canReadSales
            ? salesNavigation.map(({ href, icon, label }) => (
                <Link
                  aria-current={
                    pathname === href || pathname.startsWith(`${href}/`)
                      ? 'page'
                      : undefined
                  }
                  href={href as Route}
                  key={href}
                >
                  <NavIcon icon={icon} />
                  {label}
                </Link>
              ))
            : null}
          {[...countNavigation, ...financesNavigation, ...insightNavigation]
            .filter(({ permission }) =>
              state.session.permissions.includes(permission),
            )
            .map(({ href, icon, label }) => (
              <Link
                aria-current={
                  pathname === href || pathname.startsWith(`${href}/`)
                    ? 'page'
                    : undefined
                }
                href={href as Route}
                key={href}
              >
                <NavIcon icon={icon} />
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
