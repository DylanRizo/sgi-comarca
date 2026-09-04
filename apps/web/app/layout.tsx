import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AuthProvider } from '@/providers/auth-provider';

import './globals.css';

export const metadata: Metadata = {
  description: 'Gestión segura de inventario, ventas y finanzas.',
  title: {
    default: 'SGI La Comarca',
    template: '%s · SGI La Comarca',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
