import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AuthProvider } from '@/providers/auth-provider';

import './globals.css';

export const metadata: Metadata = {
  description: 'Base técnica del nuevo SGI La Comarca.',
  title: 'SGI La Comarca · Base técnica',
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
