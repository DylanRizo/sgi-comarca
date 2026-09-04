import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Cuenta' };

export default function AccountLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
