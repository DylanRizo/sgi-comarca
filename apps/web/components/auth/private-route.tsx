'use client';

import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { useAuth } from '@/providers/auth-provider';

export function PrivateRoute({ children }: Readonly<{ children: ReactNode }>) {
  const { state } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (state.kind !== 'anonymous') return;
    if (state.reason === 'logout' || state.reason === 'password-change') return;
    router.replace(
      (state.reason === 'expired'
        ? '/session-expired'
        : `/login?next=${encodeURIComponent(pathname)}`) as Route,
    );
  }, [pathname, router, state]);

  if (state.kind !== 'authenticated') {
    return (
      <main className="auth-page" aria-busy="true">
        <p className="auth-loading" role="status">
          Verificando sesión…
        </p>
      </main>
    );
  }

  return children;
}
