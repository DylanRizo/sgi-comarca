import type { ReactNode } from 'react';

import { PrivateRoute } from '@/components/auth/private-route';

export default function PrivateLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <PrivateRoute>{children}</PrivateRoute>;
}
