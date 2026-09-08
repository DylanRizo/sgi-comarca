'use client';

import type { UserDirectoryEntry } from '@sgi/contracts';
import { useEffect, useState } from 'react';

import { FormField } from '@/components/ui/form-field';
import { UserActions } from '@/components/settings/user-actions';
import { userAdminApi } from '@/lib/http/user-admin-api';
import { useAuth } from '@/providers/auth-provider';

const statusLabels: Record<UserDirectoryEntry['status'], string> = {
  ACTIVE: 'Activa',
  DISABLED: 'Desactivada',
  PENDING_ACTIVATION: 'Pendiente de activación',
};

const statusTones: Record<UserDirectoryEntry['status'], string> = {
  ACTIVE: 'success',
  DISABLED: 'danger',
  PENDING_ACTIVATION: 'warning',
};

/**
 * Administration of the people who use the system. The panel is filtered by
 * `users.read`, the same permission the API enforces; the ADMIN role carries no
 * implicit permission, so gating on the role would show the page to someone who
 * could not use it.
 */
export default function SettingsPage() {
  const { state } = useAuth();
  const allowed =
    state.kind === 'authenticated' &&
    state.session.permissions.includes('users.read');
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<readonly UserDirectoryEntry[] | null>(
    null,
  );
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        setError('');
        userAdminApi
          .list(search.trim(), 1, controller.signal)
          .then((page) => {
            if (!controller.signal.aborted) setEntries(page.items);
          })
          .catch(() => {
            if (!controller.signal.aborted)
              setError('No pudimos consultar el directorio de usuarios.');
          });
      },
      search.trim() === '' ? 0 : 250,
    );
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [allowed, reload, search]);

  return (
    <main className="content-page" id="main-content">
      <header className="page-heading">
        <div>
          <h1>Configuración</h1>
          <p>
            Administra quién entra al sistema, con qué acceso y en qué estado
            está su cuenta.
          </p>
        </div>
      </header>

      {!allowed ? (
        <p role="alert">
          Esta sección requiere el permiso de administración de usuarios.
        </p>
      ) : (
        <>
          {notice ? (
            <p className="form-feedback" data-tone="success" role="status">
              {notice}
            </p>
          ) : null}

          <FormField
            label="Buscar persona"
            hint="Por identificador o nombre. Vacío muestra a todas."
          >
            <input
              type="search"
              placeholder="dylan, Samantha…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </FormField>

          {error ? (
            <p role="alert">
              {error}{' '}
              <button
                className="secondary-button"
                onClick={() => setReload((value) => value + 1)}
                type="button"
              >
                Reintentar
              </button>
            </p>
          ) : !entries ? (
            <p role="status">Cargando directorio…</p>
          ) : entries.length === 0 ? (
            <section className="work-panel">
              <h2>Nadie coincide con esa búsqueda</h2>
              <p>Las cuentas se crean con el bootstrap del sistema.</p>
            </section>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Usuario</th>
                    <th scope="col">Roles</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acceso</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td data-label="Usuario">
                        <strong>{entry.displayName}</strong>
                        <br />
                        <small>{entry.loginIdentifier}</small>
                      </td>
                      <td data-label="Roles">
                        {entry.roles.length === 0
                          ? 'Sin roles'
                          : entry.roles.join(', ')}
                      </td>
                      <td data-label="Estado">
                        <span
                          className="status-badge"
                          data-tone={statusTones[entry.status]}
                        >
                          {statusLabels[entry.status]}
                        </span>
                      </td>
                      <td data-label="Acceso">
                        {entry.hasActiveCredential
                          ? `Puede entrar · ${String(entry.activeSessions)} sesión(es)`
                          : entry.hasOpenInvitation
                            ? 'Invitación vigente sin usar'
                            : 'Sin credencial ni invitación'}
                      </td>
                      <td data-label="Acciones">
                        <UserActions
                          entry={entry}
                          onDone={(message) => {
                            setNotice(message);
                            setReload((value) => value + 1);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
