import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Cierres diarios' };

export default function ClosingsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
