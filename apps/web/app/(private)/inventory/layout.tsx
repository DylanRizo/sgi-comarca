import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Inventario' };

export default function InventoryLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
