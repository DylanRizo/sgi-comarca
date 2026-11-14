'use client';

import type {
  IntegrationKeyStatus,
  IntegrationKeySummary,
} from '@sgi/contracts';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import { FormField } from '@/components/ui/form-field';
import { integrationsApi } from '@/lib/http/integrations-api';
import { useAuth } from '@/providers/auth-provider';

const statusLabels: Record<IntegrationKeyStatus, string> = {
  ACTIVE: 'Activa',
  EXPIRED: 'Caducada',
  REVOKED: 'Revocada',
};

const statusTones: Record<IntegrationKeyStatus, string> = {
  ACTIVE: 'success',
  EXPIRED: 'warning',
  REVOKED: 'danger',
};

const dateFormatter = new Intl.DateTimeFormat('es-NI', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Managua',
});

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : 'Nunca';
}

export default function IntegrationsPage() {
  const { getCsrfToken, state } = useAuth();
  const allowed =
    state.kind === 'authenticated' &&
    state.session.permissions.includes('integrations.manage');
  const [keys, setKeys] = useState<readonly IntegrationKeySummary[] | null>(
    null,
  );
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [name, setName] = useState('Bot de Marketplace');
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [purpose, setPurpose] = useState<'catalog' | 'bot'>('catalog');
  const [instanceKey, setInstanceKey] = useState('');
  const [busy, setBusy] = useState('');
  const [secret, setSecret] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    integrationsApi
      .list(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        // Cleared only once the read succeeds: resetting it synchronously in
        // the effect would trigger a cascading render.
        setError('');
        setKeys(items);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('No pudimos consultar las llaves de integración.');
      });
    return () => controller.abort();
  }, [allowed, reload]);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy('create');
    setError('');
    setNotice('');
    setCopied(false);
    try {
      const created = await integrationsApi.create(
        {
          expiresInDays,
          name: name.trim(),
          ...(purpose === 'bot'
            ? { marketplaceBotInstanceKey: instanceKey.trim() }
            : {}),
        },
        await getCsrfToken(),
      );
      setSecret(created.secret);
      setReload((value) => value + 1);
    } catch {
      setError(
        'No pudimos crear la llave. Verifica que la integración esté habilitada y que tu cuenta tenga el permiso requerido para esta llave.',
      );
    } finally {
      setBusy('');
    }
  }

  async function revokeKey(key: IntegrationKeySummary) {
    if (busy) return;
    const confirmed = window.confirm(
      `¿Revocar la llave “${key.name}”? El programa que la usa perderá acceso de inmediato.`,
    );
    if (!confirmed) return;
    setBusy(key.id);
    setError('');
    setNotice('');
    try {
      await integrationsApi.revoke(key.id, await getCsrfToken());
      setNotice(`La llave “${key.name}” quedó revocada.`);
      setReload((value) => value + 1);
    } catch {
      setError('No pudimos revocar la llave. Inténtalo de nuevo.');
    } finally {
      setBusy('');
    }
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="content-page" id="main-content">
      <header className="page-heading">
        <div>
          <h1>Integraciones</h1>
          <p>
            Gestiona las llaves de lectura del catálogo y de sincronización del
            bot.
          </p>
        </div>
        {allowed ? (
          <div className="page-heading-actions">
            <Link className="secondary-link" href="/settings/marketplace-bot">
              Monitor Bot Marketplace
            </Link>
          </div>
        ) : null}
      </header>

      {!allowed ? (
        <p role="alert">
          Esta sección requiere el permiso de administración de integraciones.
        </p>
      ) : (
        <>
          {notice ? (
            <p className="form-feedback" data-tone="success" role="status">
              {notice}
            </p>
          ) : null}
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
          ) : null}

          {secret ? (
            <section className="work-panel" aria-live="polite">
              <h2>Guarda esta llave ahora</h2>
              <p>
                Es la única vez que se muestra. El sistema guarda solo una
                huella, así que si la pierdes tendrás que crear otra.
              </p>
              <FormField label="Llave de integración">
                <input readOnly value={secret} />
              </FormField>
              <button
                className="secondary-button"
                onClick={() => void copySecret()}
                type="button"
              >
                {copied ? 'Copiada' : 'Copiar llave'}
              </button>{' '}
              <button
                className="secondary-button"
                onClick={() => {
                  setSecret('');
                  setCopied(false);
                }}
                type="button"
              >
                Ya la guardé
              </button>
            </section>
          ) : null}

          <section className="work-panel">
            <h2>Nueva llave</h2>
            <form onSubmit={(event) => void createKey(event)}>
              <FormField label="Uso de la llave">
                <select
                  value={purpose}
                  onChange={(event) =>
                    setPurpose(event.target.value === 'bot' ? 'bot' : 'catalog')
                  }
                >
                  <option value="catalog">Lectura de catálogo</option>
                  <option value="bot">Sincronización del bot</option>
                </select>
              </FormField>
              {purpose === 'bot' ? (
                <FormField
                  label="Identificador de la instalación"
                  hint="Usa el mismo identificador configurado en el bot. Admite letras, números, guiones y guiones bajos."
                >
                  <input
                    value={instanceKey}
                    onChange={(event) => setInstanceKey(event.target.value)}
                    minLength={8}
                    maxLength={64}
                    pattern="[A-Za-z0-9_\\-]{8,64}"
                    required
                  />
                </FormField>
              ) : null}
              <FormField
                label="Nombre"
                hint="Para reconocer qué programa la usa."
              >
                <input
                  maxLength={80}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </FormField>
              <FormField
                label="Caduca en (días)"
                hint="Entre 1 y 90. Al caducar hay que crear otra."
              >
                <input
                  max={90}
                  min={1}
                  onChange={(event) =>
                    setExpiresInDays(Number(event.target.value))
                  }
                  required
                  type="number"
                  value={expiresInDays}
                />
              </FormField>
              <button disabled={busy !== ''} type="submit">
                {busy === 'create' ? 'Creando…' : 'Crear llave'}
              </button>
            </form>
          </section>

          {!keys ? (
            <p role="status">Cargando llaves…</p>
          ) : keys.length === 0 ? (
            <section className="work-panel">
              <h2>Todavía no hay llaves</h2>
              <p>Crea una para conectar un programa externo.</p>
            </section>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Caduca</th>
                    <th scope="col">Último uso</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.id}>
                      <td data-label="Nombre">
                        <strong>{key.name}</strong>
                        <br />
                        <small>
                          {key.marketplaceBotInstanceKey
                            ? `Bot · ${key.marketplaceBotInstanceKey}`
                            : 'Lectura de catálogo'}
                        </small>
                        <br />
                        <small>Empieza por {key.keyPrefix}…</small>
                      </td>
                      <td data-label="Estado">
                        <span
                          className="status-badge"
                          data-tone={statusTones[key.status]}
                        >
                          {statusLabels[key.status]}
                        </span>
                      </td>
                      <td data-label="Caduca">{formatDate(key.expiresAt)}</td>
                      <td data-label="Último uso">
                        {formatDate(key.lastUsedAt)}
                      </td>
                      <td data-label="Acciones">
                        {key.status === 'REVOKED' ? (
                          '—'
                        ) : (
                          <button
                            className="secondary-button"
                            disabled={busy !== ''}
                            onClick={() => void revokeKey(key)}
                            type="button"
                          >
                            {busy === key.id ? 'Revocando…' : 'Revocar'}
                          </button>
                        )}
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
