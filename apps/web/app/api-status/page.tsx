import Link from 'next/link';

import { ApiStatusCard } from '@/components/api-status-card';
import { publicApiUrl } from '@/lib/environment';

export default function ApiStatusPage() {
  return (
    <main className="shell">
      <section className="hero compact">
        <p className="eyebrow">Diagnóstico local</p>
        <h1>Estado de servicios</h1>
        <p className="lead">
          Esta vista consulta únicamente el endpoint técnico de salud.
        </p>
        <ApiStatusCard apiUrl={publicApiUrl()} />
        <Link className="secondary-link" href="/">
          Volver a la base técnica
        </Link>
      </section>
    </main>
  );
}
