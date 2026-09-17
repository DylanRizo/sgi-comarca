import { Suspense } from 'react';

import { AlexaLinkForm } from '@/components/auth/alexa-link-form';
import { AuthShell } from '@/components/auth/auth-shell';

export default function AlexaLinkPage() {
  return (
    <AuthShell
      description="Autoriza consultas de voz de solo lectura con tu cuenta del SGI."
      title="Vincular Inventario Comarca con Alexa"
    >
      <Suspense fallback={<p role="status">Preparando autorización…</p>}>
        <AlexaLinkForm />
      </Suspense>
    </AuthShell>
  );
}
