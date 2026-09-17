import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Acceso no autorizado' };

export default function UnauthorizedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
