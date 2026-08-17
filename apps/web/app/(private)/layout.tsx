import type { ReactNode } from 'react';

import { PrivateRoute } from '@/components/auth/private-route';
import { AuthenticatedShell } from '@/components/layout/authenticated-shell';

export default function PrivateLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <PrivateRoute>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </PrivateRoute>
  );
}
