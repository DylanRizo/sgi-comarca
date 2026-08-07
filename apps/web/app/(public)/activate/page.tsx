import { ActivationForm } from '@/components/auth/activation-form';
import { AuthShell } from '@/components/auth/auth-shell';

export default function ActivatePage() {
  return (
    <AuthShell
      description="Crea tu contraseña para completar la activación."
      title="Activar cuenta"
    >
      <ActivationForm />
    </AuthShell>
  );
}
