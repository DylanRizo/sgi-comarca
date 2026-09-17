'use client';
import Link from 'next/link';
import type { Route } from 'next';
import { ClipboardCheck, PackagePlus, ShoppingCart, Truck } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';

const actions = [
  {
    label: 'Nuevo producto',
    href: '/products/new',
    permission: 'products.manage',
    Icon: PackagePlus,
  },
  {
    label: 'Registrar entrada',
    href: '/inventory/receipts/new',
    permission: 'stock-receipts.create',
    Icon: Truck,
  },
  {
    label: 'Registrar venta',
    href: '/sales?create=1',
    permission: 'sales.create',
    Icon: ShoppingCart,
  },
  {
    label: 'Nuevo conteo',
    href: '/inventory/counts?create=1',
    permission: 'inventory.audit.create',
    Icon: ClipboardCheck,
  },
  {
    label: 'Completar valoraciones',
    href: '/inventory/valuations',
    permission: 'inventory.valuation.manage',
    Icon: ClipboardCheck,
  },
] as const;

export function OperationLinks() {
  const { state } = useAuth();
  if (state.kind !== 'authenticated') return null;
  return (
    <div className="operation-toolbar" aria-label="Acciones rápidas">
      {actions
        .filter((action) =>
          state.session.permissions.includes(action.permission),
        )
        .map(({ label, href, Icon }) => (
          <Link className="secondary-link" key={href} href={href as Route}>
            <Icon size={18} aria-hidden="true" />
            {label}
          </Link>
        ))}
    </div>
  );
}
