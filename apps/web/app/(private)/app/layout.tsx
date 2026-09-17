import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Inicio' };

export default function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
