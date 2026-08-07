import type { Route } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';

export default function SessionExpiredPage() {
  return (
    <AuthShell
      description="La sesión venció o fue revocada. Inicia sesión nuevamente."
      title="Sesión finalizada"
    >
      <Link className="primary-link" href={'/login' as Route}>
        Ir al inicio de sesión
      </Link>
    </AuthShell>
  );
}
