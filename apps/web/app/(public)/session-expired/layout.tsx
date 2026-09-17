import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Sesión vencida' };

export default function SessionExpiredLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
