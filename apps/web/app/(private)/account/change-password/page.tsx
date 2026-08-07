import type { Route } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { ChangePasswordForm } from '@/components/auth/change-password-form';

export default function ChangePasswordPage() {
  return (
    <AuthShell
      description="Al terminar, todas tus sesiones se cerrarán."
      title="Cambiar contraseña"
    >
      <ChangePasswordForm />
      <Link className="secondary-link" href={'/app' as Route}>
        Cancelar
      </Link>
    </AuthShell>
  );
}
