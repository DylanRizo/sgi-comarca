import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Ventas' };

export default function SalesLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
