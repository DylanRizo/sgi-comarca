'use client';

import type {
  MarketplaceBotCommandPayload,
  MarketplaceBotInstanceView,
  MarketplaceBotStateData,
} from '@sgi/contracts';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { integrationsApi } from '@/lib/http/integrations-api';
import { destructiveCommandConfirmation } from '@/lib/integrations/marketplace-bot-commands';
import { useAuth } from '@/providers/auth-provider';

import { AlertsSection } from './marketplace-bot/alerts-section';
import { CommandsSection } from './marketplace-bot/commands-section';
import { LeadsSection } from './marketplace-bot/leads-section';
import { ListingsSection } from './marketplace-bot/listings-section';
import { connectionLabels } from './marketplace-bot/presentation';
import { QueueSection } from './marketplace-bot/queue-section';
import type { MonitorSectionProps } from './marketplace-bot/section-props';
import { WorkerSection } from './marketplace-bot/worker-section';

export function MarketplaceBotMonitor() {
  const { getCsrfToken, state } = useAuth();
  const allowed =
    state.kind === 'authenticated' &&
    (state.session.permissions.includes('integrations.manage') ||
      state.session.permissions.includes('sales.read'));

  const [data, setData] = useState<MarketplaceBotStateData | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // State alone cannot stop a second click that lands before the re-render.
  const sending = useRef(false);
  // A request that never got an answer may or may not have been queued. The
  // same command sent again reuses its key, so the server answers with the
  // command already queued instead of a second one.
  const uncertainIntent = useRef<{ key: string; signature: string } | null>(
    null,
  );

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    integrationsApi
      .getBotState(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setError('');
        setData(next);
        setSelectedInstanceId((current) => {
          if (current && next.instances.some((item) => item.id === current)) {
            return current;
          }
          return next.instances[0]?.id ?? '';
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('No pudimos consultar el estado del Bot de Marketplace.');
        }
      });

    return () => controller.abort();
  }, [allowed, reload]);

  useEffect(() => {
    if (!allowed) return;
    const interval = window.setInterval(() => {
      setReload((value) => value + 1);
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [allowed]);

  async function sendCommand(
    instance: MarketplaceBotInstanceView,
    command: MarketplaceBotCommandPayload,
    successMessage: string,
  ) {
    if (sending.current) return;
    const confirmation = destructiveCommandConfirmation(
      command,
      instance.snapshot,
    );
    if (confirmation && !window.confirm(confirmation)) return;

    const signature = JSON.stringify([instance.id, command]);
    const idempotencyKey =
      uncertainIntent.current?.signature === signature
        ? uncertainIntent.current.key
        : crypto.randomUUID();
    sending.current = true;
    setBusy(command.type);
    setError('');
    setNotice('');
    try {
      await integrationsApi.enqueueBotCommand(
        instance.id,
        command,
        await getCsrfToken(),
        idempotencyKey,
      );
      uncertainIntent.current = null;
      setNotice(successMessage);
      setReload((value) => value + 1);
    } catch (caught) {
      // An HTTP answer settles the attempt. Anything else leaves it unknown.
      uncertainIntent.current =
        caught instanceof ApiHttpError
          ? null
          : { key: idempotencyKey, signature };
      setError(
        caught instanceof ApiHttpError
          ? 'No pudimos encolar el comando para el bot. Verifica tus permisos e inténtalo de nuevo.'
          : 'No pudimos confirmar si el comando quedó en cola. Revisa el historial; si no aparece, repite la misma acción y no se duplicará.',
      );
      setReload((value) => value + 1);
    } finally {
      sending.current = false;
      setBusy('');
    }
  }

  async function cancelCommand(commandId: string) {
    if (sending.current) return;
    sending.current = true;
    setBusy(`cancel-${commandId}`);
    setError('');
    setNotice('');
    try {
      await integrationsApi.cancelBotCommand(commandId, await getCsrfToken());
      setNotice('El comando pendiente quedó cancelado.');
    } catch (caught) {
      setError(
        caught instanceof ApiHttpError && caught.status === 409
          ? 'El bot ya recibió ese comando, así que no se puede cancelar desde el SGI. Su resultado aparecerá en el historial.'
          : 'No pudimos cancelar el comando.',
      );
    } finally {
      sending.current = false;
      setBusy('');
      setReload((value) => value + 1);
    }
  }

  if (!allowed) {
    return (
      <p role="alert">
        Esta sección requiere permiso de consulta comercial o administración de
        integraciones.
      </p>
    );
  }

  const canControl = data?.canControl ?? false;
  const instances = data?.instances ?? [];
  const activeInstance =
    instances.find((item) => item.id === selectedInstanceId) ??
    instances[0] ??
    null;

  return (
    <div className="content-page">
      <header className="page-heading">
        <div>
          <h1>Bot Marketplace</h1>
          <p>
            Monitoreo en vivo de cuentas de Facebook Marketplace, interesados
            sin responder, conversión de clics a chats, calendario de
            publicaciones y acciones remotas.
          </p>
        </div>
        <div className="page-heading-actions">
          <button
            className="secondary-button"
            onClick={() => setReload((value) => value + 1)}
            type="button"
          >
            Actualizar ahora
          </button>
          {canControl ? (
            <Link className="secondary-link" href="/settings/integrations">
              Llaves de acceso
            </Link>
          ) : null}
        </div>
      </header>

      {!canControl ? (
        <section className="work-panel" role="status">
          <h2>Vista de consulta para vendedores</h2>
          <p>
            Puedes revisar los chats sin responder, el rendimiento por producto
            y el calendario de anuncios. La ejecución de comandos remotos sobre
            el bot está reservada a administración.
          </p>
        </section>
      ) : null}

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

      {!data ? (
        <p role="status">Cargando telemetría del bot…</p>
      ) : !activeInstance ? (
        <section className="work-panel">
          <h2>Todavía no hay instancias conectadas</h2>
          <p>
            Cuando el worker del Bot de Marketplace envíe su primer pulso a{' '}
            <code>/api/v1/integrations/marketplace-bot/sync</code> con una llave
            activa, aquí aparecerán sus estadísticas, leads y controles remotos.
          </p>
        </section>
      ) : (
        <>
          {instances.length > 1 ? (
            <section className="work-panel">
              <label className="form-field">
                <span>Instancia del bot</span>
                <select
                  onChange={(event) =>
                    setSelectedInstanceId(event.target.value)
                  }
                  value={activeInstance.id}
                >
                  {instances.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.instanceName} — {connectionLabels[item.connection]}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          ) : null}

          <InstanceMonitorBody
            busy={busy}
            canControl={canControl}
            instance={activeInstance}
            onCancelCommand={cancelCommand}
            onSendCommand={sendCommand}
          />
        </>
      )}
    </div>
  );
}

function InstanceMonitorBody(props: MonitorSectionProps) {
  return (
    <>
      <WorkerSection {...props} />
      <AlertsSection {...props} />
      <LeadsSection {...props} />
      <QueueSection {...props} />
      <ListingsSection {...props} />
      <CommandsSection {...props} />
    </>
  );
}
