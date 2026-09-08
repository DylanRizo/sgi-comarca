'use client';

import type { UserDirectoryEntry } from '@sgi/contracts';
import { useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { userAdminApi } from '@/lib/http/user-admin-api';
import { useAuth } from '@/providers/auth-provider';

/**
 * The commands the API already enforced, brought to the interface. Each button
 * is shown only with the permission the backend requires, and every failure is
 * reported with the reason the server gave rather than a generic apology.
 */
export function UserActions({
  entry,
  onDone,
}: Readonly<{
  entry: UserDirectoryEntry;
  onDone: (message: string) => void;
}>) {
  const { getCsrfToken, state } = useAuth();
  const permissions =
    state.kind === 'authenticated' ? state.session.permissions : [];
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  /**
   * Held in memory for as long as the panel is open and never persisted: the
   * link is the only thing between a stranger and this account.
   */
  const [invitation, setInvitation] = useState('');
  const [copied, setCopied] = useState(false);

  async function run(
    action: string,
    work: (csrf: string, key: string) => Promise<unknown>,
    done: string,
  ) {
    if (busy) return;
    setBusy(action);
    setError('');
    try {
      await work(await getCsrfToken(), crypto.randomUUID());
      onDone(done);
    } catch (failure) {
      setError(
        failure instanceof ApiHttpError
          ? failure.code === 'LAST_ADMIN_PROTECTED'
            ? 'No se puede: es la última cuenta administradora activa.'
            : failure.message
          : 'No pudimos completar la operación.',
      );
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="user-actions">
      <div className="user-actions-buttons">
        {permissions.includes('users.invitations.create') &&
        entry.status !== 'DISABLED' ? (
          <button
            className="link-button"
            disabled={busy !== ''}
            onClick={() => {
              void (async () => {
                setBusy('invite');
                setError('');
                try {
                  const created = await userAdminApi.invite(
                    entry.id,
                    await getCsrfToken(),
                    crypto.randomUUID(),
                  );
                  setCopied(false);
                  setInvitation(
                    `${window.location.origin}/activate#token=${created.token}`,
                  );
                } catch (failure) {
                  setError(
                    failure instanceof ApiHttpError
                      ? failure.message
                      : 'No pudimos generar la invitación.',
                  );
                } finally {
                  setBusy('');
                }
              })();
            }}
            type="button"
          >
            {busy === 'invite'
              ? 'Generando…'
              : entry.hasOpenInvitation
                ? 'Regenerar invitación'
                : 'Crear invitación'}
          </button>
        ) : null}

        {permissions.includes('users.sessions.revoke') &&
        entry.activeSessions > 0 ? (
          <button
            className="link-button"
            disabled={busy !== ''}
            onClick={() => {
              void run(
                'sessions',
                (csrf, key) => userAdminApi.revokeSessions(entry.id, csrf, key),
                `Sesiones de ${entry.displayName} cerradas.`,
              );
            }}
            type="button"
          >
            {busy === 'sessions' ? 'Cerrando…' : 'Cerrar sesiones'}
          </button>
        ) : null}

        {permissions.includes('users.credentials.revoke') &&
        entry.hasActiveCredential ? (
          <button
            className="link-button"
            disabled={busy !== ''}
            onClick={() => {
              void run(
                'credential',
                (csrf, key) =>
                  userAdminApi.revokeCredential(entry.id, csrf, key),
                `Contraseña de ${entry.displayName} revocada. Necesita una invitación nueva.`,
              );
            }}
            type="button"
          >
            {busy === 'credential' ? 'Revocando…' : 'Revocar contraseña'}
          </button>
        ) : null}

        {permissions.includes('users.status.manage') &&
        entry.status !== 'DISABLED' ? (
          <button
            className="link-button"
            disabled={busy !== ''}
            onClick={() => {
              void run(
                'deactivate',
                (csrf, key) => userAdminApi.deactivate(entry.id, csrf, key),
                `${entry.displayName} quedó sin acceso.`,
              );
            }}
            type="button"
          >
            {busy === 'deactivate' ? 'Desactivando…' : 'Desactivar'}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}

      {invitation ? (
        <div className="invitation-panel">
          <p>
            Enlace de activación para <strong>{entry.displayName}</strong>.
            Entrégalo por un canal privado y no lo guardes en ningún archivo:
            quien lo tenga puede definir la contraseña de esta cuenta.
          </p>
          <input
            aria-label="Enlace de activación"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={invitation}
          />
          <div className="user-actions-buttons">
            <button
              className="secondary-button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(invitation)
                  .then(() => setCopied(true))
                  .catch(() =>
                    setError(
                      'El navegador no permitió copiar. Selecciona el enlace y cópialo a mano.',
                    ),
                  );
              }}
              type="button"
            >
              {copied ? '¡Copiado!' : 'Copiar enlace'}
            </button>
            <button
              className="link-button"
              onClick={() => {
                // The directory refreshes when the link is dismissed, not when
                // it is created: reloading earlier would unmount this panel and
                // take the only copy of the link with it.
                setInvitation('');
                setCopied(false);
                onDone(
                  `Invitación creada para ${entry.displayName}. Entrégala por un canal privado.`,
                );
              }}
              type="button"
            >
              Ocultar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
