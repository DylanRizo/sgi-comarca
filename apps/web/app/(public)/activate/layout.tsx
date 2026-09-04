import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Activar cuenta' };

export default function ActivationLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
