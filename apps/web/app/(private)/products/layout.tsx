import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Productos' };

export default function ProductsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
