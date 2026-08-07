import type { Route } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';

export default function UnauthorizedPage() {
  return (
    <AuthShell
      description="Tu sesión no tiene permiso para acceder a esta función."
      title="Acceso no autorizado"
    >
      <Link className="primary-link" href={'/app' as Route}>
        Volver al inicio
      </Link>
    </AuthShell>
  );
}
