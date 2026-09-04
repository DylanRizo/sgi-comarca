import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default function LoginLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
