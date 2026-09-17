import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Finanzas' };

export default function FinancesLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
