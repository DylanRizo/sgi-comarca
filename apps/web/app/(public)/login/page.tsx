import { Suspense } from 'react';

import { LoginForm } from '@/components/auth/login-form';
import { AuthShell } from '@/components/auth/auth-shell';

export default function LoginPage() {
  return (
    <AuthShell
      description="Usa tus credenciales para entrar al sistema."
      title="Iniciar sesión"
    >
      <Suspense fallback={<p role="status">Preparando formulario…</p>}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
