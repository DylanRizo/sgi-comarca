'use client';

import type { Route } from 'next';
import Link from 'next/link';

import { useAuth } from '@/providers/auth-provider';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-NI', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function AppPage() {
  const { state } = useAuth();
  if (state.kind !== 'authenticated') return null;

  return (
    <main className="dashboard-page" id="main-content">
      <section className="dashboard-card" aria-labelledby="welcome-title">
        <p className="eyebrow">SGI La Comarca</p>
        <h1 id="welcome-title">Bienvenido, {state.session.displayName}</h1>
        <dl className="session-details">
          <div>
            <dt>Usuario</dt>
            <dd>{state.session.identifier}</dd>
          </div>
          <div>
            <dt>Inactividad</dt>
            <dd>{formatDate(state.session.idleExpiresAt)}</dd>
          </div>
          <div>
            <dt>Límite absoluto</dt>
            <dd>{formatDate(state.session.absoluteExpiresAt)}</dd>
          </div>
        </dl>
        <section aria-labelledby="permissions-title">
          <h2 id="permissions-title">Permisos disponibles</h2>
          {state.session.permissions.length ? (
            <ul className="permissions-list">
              {state.session.permissions.map((permission) => (
                <li key={permission}>{permission}</li>
              ))}
            </ul>
          ) : (
            <p>No hay acciones disponibles.</p>
          )}
        </section>
        <div className="button-row">
          <Link
            className="primary-link"
            href={'/account/change-password' as Route}
          >
            Cambiar contraseña
          </Link>
        </div>
      </section>
    </main>
  );
}
