'use client';

import type {
  MarketplaceBotCommandPayload,
  MarketplaceBotCommandStatus,
  MarketplaceBotCommandType,
  MarketplaceBotConnection,
  MarketplaceBotInstanceView,
  MarketplaceBotListingAction,
  MarketplaceBotSafetyLevel,
  MarketplaceBotStateData,
} from '@sgi/contracts';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { integrationsApi } from '@/lib/http/integrations-api';
import {
  getAvailableListingActions,
  getListingActionsEmptyLabel,
} from '@/lib/integrations/marketplace-bot-listings';
import {
  canMoveQueueItem,
  formatBotLocalTime,
  queueStatusLabels,
} from '@/lib/integrations/marketplace-bot-schedule';
import { useAuth } from '@/providers/auth-provider';

import {
  BotSchedulePanel,
  QueueItemTimeControls,
} from './marketplace-bot-schedule';

const connectionLabels: Record<MarketplaceBotConnection, string> = {
  DELAYED: 'Con retraso',
  OFFLINE: 'Sin señal',
  ONLINE: 'En línea',
};

const connectionTones: Record<MarketplaceBotConnection, string> = {
  DELAYED: 'warning',
  OFFLINE: 'cancelled',
  ONLINE: 'completed',
};

const safetyLabels: Record<MarketplaceBotSafetyLevel, string> = {
  active: 'Activo',
  balanced: 'Equilibrado',
  conservative: 'Conservador',
};

const commandLabels: Record<MarketplaceBotCommandType, string> = {
  APPROVE_QUEUE_ITEMS: 'Aprobar cola propuesta',
  CANCEL_LISTING_ACTION: 'Cancelar acción de anuncio',
  GENERATE_WEEK: 'Generar calendario semanal',
  LISTING_ACTION: 'Acción sobre anuncio',
  PAUSE_ACCOUNT: 'Pausar cuenta',
  QUEUE_ITEM_ACTION: 'Acción en ítem de cola',
  REQUEST_SCAN: 'Escanear anuncios y leads',
  RESOLVE_ALERT: 'Resolver alerta',
  RESOLVE_ALL_ALERTS: 'Resolver todas las alertas',
  RESUME_ACCOUNT: 'Reanudar cuenta',
  SET_BOT_ENABLED: 'Cambiar encendido del bot',
  SET_SAFETY_LEVEL: 'Cambiar nivel de seguridad',
  SET_SCHEDULE: 'Cambiar horario de publicación',
  SYNC_SGI_CATALOG: 'Sincronizar catálogo SGI',
};

const commandStatusLabels: Record<MarketplaceBotCommandStatus, string> = {
  CANCELLED: 'Cancelado',
  COMPLETED: 'Completado',
  DISPATCHED: 'Enviado · sin confirmar',
  EXPIRED: 'Expirado',
  FAILED: 'Falló',
  PENDING: 'Pendiente',
};

const commandStatusTones: Record<MarketplaceBotCommandStatus, string> = {
  CANCELLED: 'warning',
  COMPLETED: 'completed',
  DISPATCHED: 'transit',
  EXPIRED: 'warning',
  FAILED: 'cancelled',
  PENDING: 'transit',
};

const listingActionLabels: Record<MarketplaceBotListingAction, string> = {
  delete: 'Eliminar',
  mark_available: 'Marcar disponible',
  mark_out_of_stock: 'Marcar agotado',
  relist: 'Republicar',
  renew: 'Renovar',
};

const dateFormatter = new Intl.DateTimeFormat('es-NI', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Managua',
});

function formatDate(value: string | null): string {
  if (!value) return 'Nunca';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
}

function formatSafetyLevel(level: string): string {
  if (level === 'conservative' || level === 'balanced' || level === 'active') {
    return safetyLabels[level];
  }
  return level || 'Equilibrado';
}

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
  const [uncertain, setUncertain] = useState(false);
  const sending = useRef(false);
  const pendingSend = useRef<{
    instanceId: string;
    command: MarketplaceBotCommandPayload;
    requestId: string;
    message: string;
  } | null>(null);
  const isManager =
    state.kind === 'authenticated' &&
    state.session.permissions.includes('integrations.manage');

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
    if (busy || sending.current || pendingSend.current) return;
    if (
      ((command.type === 'LISTING_ACTION' &&
        (command.action === 'delete' || command.action === 'relist')) ||
        (command.type === 'GENERATE_WEEK' && command.replace) ||
        (command.type === 'QUEUE_ITEM_ACTION' && command.action === 'cancel') ||
        command.type === 'RESOLVE_ALL_ALERTS') &&
      !window.confirm('¿Confirmas esta acción en el Bot de Marketplace?')
    )
      return;
    pendingSend.current = {
      instanceId: instance.id,
      command,
      requestId: crypto.randomUUID(),
      message: successMessage,
    };
    await sendPendingCommand();
  }

  async function sendPendingCommand() {
    const pending = pendingSend.current;
    if (!pending || sending.current) return;
    sending.current = true;
    setBusy(pending.command.type);
    setError('');
    setNotice('');
    try {
      await integrationsApi.enqueueBotCommand(
        pending.instanceId,
        pending.command,
        pending.requestId,
        await getCsrfToken(uncertain),
      );
      pendingSend.current = null;
      setUncertain(false);
      setNotice(pending.message);
      setReload((value) => value + 1);
    } catch (failure) {
      const ambiguous =
        uncertain ||
        !(failure instanceof ApiHttpError) ||
        failure.status >= 500;
      setUncertain(ambiguous);
      if (!ambiguous) {
        pendingSend.current = null;
        setError(
          'No pudimos encolar el comando. Revisa los permisos y el estado del bot.',
        );
      }
    } finally {
      sending.current = false;
      setBusy('');
    }
  }

  async function cancelCommand(commandId: string) {
    if (busy) return;
    setBusy(`cancel-${commandId}`);
    setError('');
    setNotice('');
    try {
      await integrationsApi.cancelBotCommand(commandId, await getCsrfToken());
      setNotice('El comando pendiente quedó cancelado.');
      setReload((value) => value + 1);
    } catch (failure) {
      if (failure instanceof ApiHttpError && failure.status === 409) {
        setError(
          'El comando ya salió de la cola y no se puede cancelar desde el SGI.',
        );
        setReload((value) => value + 1);
      } else {
        setError('No pudimos cancelar el comando.');
      }
    } finally {
      setBusy('');
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
          {isManager ? (
            <Link className="secondary-link" href="/settings/integrations">
              Llaves de acceso
            </Link>
          ) : null}
        </div>
      </header>

      {!canControl ? (
        <section className="work-panel" role="status">
          <h2>
            {isManager
              ? 'Control remoto deshabilitado'
              : 'Vista de consulta para vendedores'}
          </h2>
          <p>
            Puedes revisar los chats sin responder, el rendimiento por producto
            y el calendario de anuncios.
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

      {uncertain ? (
        <div role="alert">
          No pudimos confirmar si la orden quedó encolada. Puedes recuperar el
          resultado sin crear otra orden.{' '}
          <button
            type="button"
            disabled={busy !== ''}
            onClick={() => void sendPendingCommand()}
          >
            Reintentar orden
          </button>
        </div>
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
            busy={uncertain ? 'uncertain' : busy}
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

function InstanceMonitorBody({
  busy,
  canControl,
  instance,
  onCancelCommand,
  onSendCommand,
}: {
  busy: string;
  canControl: boolean;
  instance: MarketplaceBotInstanceView;
  onCancelCommand: (commandId: string) => Promise<void>;
  onSendCommand: (
    instance: MarketplaceBotInstanceView,
    command: MarketplaceBotCommandPayload,
    successMessage: string,
  ) => Promise<void>;
}) {
  const { snapshot } = instance;
  const { worker, accounts, leads, listings, queue, alerts } = snapshot;
  const schedule = snapshot.schedule ?? null;
  const send = (command: MarketplaceBotCommandPayload, message: string) =>
    onSendCommand(instance, command, message);

  const plannedCount = queue.summary.planned ?? 0;
  const approvedCount =
    (queue.summary.approved ?? 0) + (queue.summary.queued ?? 0);
  const publishedCount = queue.summary.published ?? 0;
  const blockedOrFailedCount =
    (queue.summary.blocked ?? 0) + (queue.summary.failed ?? 0);
  const unapprovedQueueIds = queue.upcoming
    .filter((item) => !item.approved && item.status === 'planned')
    .map((item) => item.id);

  return (
    <>
      <section className="detail-section" aria-labelledby="bot-worker-heading">
        <div className="section-heading">
          <h2 id="bot-worker-heading">Estado del Worker y Cuentas</h2>
        </div>

        <div className="kpi-grid">
          <article className="kpi-card">
            <span className="kpi-label">Conexión</span>
            <strong className="kpi-value">
              <span
                className="status-badge"
                data-tone={connectionTones[instance.connection]}
              >
                {connectionLabels[instance.connection]}
              </span>
            </strong>
            <span className="kpi-note">
              Último pulso: {formatDate(instance.lastHeartbeatAt)}
            </span>
          </article>

          <article className="kpi-card">
            <span className="kpi-label">Estado del bot</span>
            <strong className="kpi-value">
              {worker.enabled ? 'Encendido' : 'En pausa'}
            </strong>
            <span className="kpi-note">
              Modo: {worker.mode} · Seguridad:{' '}
              {formatSafetyLevel(worker.safetyLevel)}
            </span>
          </article>

          <article className="kpi-card">
            <span className="kpi-label">Instancia</span>
            <strong className="kpi-value">{instance.instanceName}</strong>
            <span className="kpi-note">
              {worker.processRunning ? 'Worker activo' : worker.status}
              {instance.botVersion ? ` · v${instance.botVersion}` : ''}
              {worker.currentItem ? ` · ${worker.currentItem}` : ''}
            </span>
          </article>

          <article className="kpi-card">
            <span className="kpi-label">Alertas abiertas</span>
            <strong
              className="kpi-value"
              data-tone={alerts.length > 0 ? 'warning' : undefined}
            >
              {alerts.length}
            </strong>
            <span className="kpi-note">
              {alerts.length === 0
                ? 'Sin alertas activas'
                : 'Requieren revisión en el panel'}
            </span>
          </article>
        </div>

        {worker.currentItem ? (
          <p className="form-feedback" data-tone="info" role="status">
            El bot está publicando «{worker.currentItem}». Las órdenes que
            envíes se ejecutan apenas termine.
          </p>
        ) : null}

        {canControl ? (
          <div className="work-panel">
            <h3>Acciones rápidas sobre el bot</h3>
            <div className="user-actions-buttons">
              <button
                className="primary-button"
                disabled={busy !== ''}
                onClick={() =>
                  void onSendCommand(
                    instance,
                    {
                      enabled: !worker.enabled,
                      type: 'SET_BOT_ENABLED',
                    },
                    worker.enabled
                      ? 'Se envió la orden para pausar el bot.'
                      : 'Se envió la orden para encender el bot.',
                  )
                }
                type="button"
              >
                {worker.enabled ? 'Pausar bot' : 'Encender bot'}
              </button>

              <button
                className="secondary-button"
                disabled={busy !== ''}
                onClick={() =>
                  void onSendCommand(
                    instance,
                    { type: 'SYNC_SGI_CATALOG' },
                    'Se solicitó sincronizar el catálogo del SGI en el bot.',
                  )
                }
                type="button"
              >
                Sincronizar inventario SGI
              </button>

              <button
                className="secondary-button"
                disabled={busy !== ''}
                onClick={() =>
                  void onSendCommand(
                    instance,
                    { account: null, type: 'REQUEST_SCAN' },
                    'Se solicitó un escaneo inmediato de anuncios y leads.',
                  )
                }
                type="button"
              >
                Escanear anuncios y leads ahora
              </button>

              <button
                className="secondary-button"
                disabled={busy !== ''}
                onClick={() =>
                  void onSendCommand(
                    instance,
                    { replace: false, type: 'GENERATE_WEEK' },
                    'Se solicitó generar el calendario semanal.',
                  )
                }
                type="button"
              >
                Generar semana
              </button>

              {(['conservative', 'balanced', 'active'] as const).map(
                (level) => (
                  <button
                    className="secondary-button"
                    disabled={busy !== '' || worker.safetyLevel === level}
                    key={level}
                    onClick={() =>
                      void onSendCommand(
                        instance,
                        { level, type: 'SET_SAFETY_LEVEL' },
                        `Se solicitó cambiar el nivel de seguridad a ${safetyLabels[level]}.`,
                      )
                    }
                    type="button"
                  >
                    Seguridad: {safetyLabels[level]}
                  </button>
                ),
              )}
            </div>
          </div>
        ) : null}

        <BotSchedulePanel
          busy={busy !== ''}
          canControl={canControl}
          onSend={send}
          schedule={schedule}
        />

        {accounts.length > 0 ? (
          <div className="balance-grid">
            {accounts.map((account) => {
              const isPaused = Boolean(account.pausedUntil);
              return (
                <article className="balance-card" key={account.key}>
                  <header>
                    <div>
                      <p className="warehouse-code">{account.key}</p>
                      <h3>{account.displayName}</h3>
                    </div>
                    <span
                      className="status-badge"
                      data-tone={isPaused ? 'warning' : 'completed'}
                    >
                      {isPaused ? 'En enfriamiento' : account.status}
                    </span>
                  </header>
                  <dl>
                    <div>
                      <dt>Publicaciones hoy</dt>
                      <dd>
                        {account.publishedToday} / {account.dailyLimit ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Publicaciones 7 días</dt>
                      <dd>
                        {account.publishedWeek} / {account.weeklyLimit ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Enfriamiento hasta</dt>
                      <dd>{formatDate(account.pausedUntil)}</dd>
                    </div>
                    <div>
                      <dt>Último escaneo</dt>
                      <dd>{formatDate(account.lastScanAt)}</dd>
                    </div>
                    {account.pauseReason ? (
                      <div>
                        <dt>Motivo de pausa</dt>
                        <dd>{account.pauseReason}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {canControl ? (
                    <div className="user-actions-buttons">
                      {isPaused ? (
                        <button
                          className="secondary-button"
                          disabled={busy !== ''}
                          onClick={() =>
                            void onSendCommand(
                              instance,
                              {
                                account: account.key,
                                type: 'RESUME_ACCOUNT',
                              },
                              `Se solicitó reanudar la cuenta ${account.displayName}.`,
                            )
                          }
                          type="button"
                        >
                          Reanudar cuenta
                        </button>
                      ) : (
                        <button
                          className="secondary-button"
                          disabled={busy !== ''}
                          onClick={() =>
                            void onSendCommand(
                              instance,
                              {
                                account: account.key,
                                hours: 24,
                                type: 'PAUSE_ACCOUNT',
                              },
                              `Se solicitó pausar 24h la cuenta ${account.displayName}.`,
                            )
                          }
                          type="button"
                        >
                          Pausar 24h
                        </button>
                      )}
                      <button
                        className="secondary-button"
                        disabled={busy !== ''}
                        onClick={() =>
                          void onSendCommand(
                            instance,
                            {
                              account: account.key,
                              type: 'REQUEST_SCAN',
                            },
                            `Se solicitó escanear la cuenta ${account.displayName}.`,
                          )
                        }
                        type="button"
                      >
                        Escanear cuenta
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      {alerts.length > 0 ? (
        <section
          className="detail-section"
          aria-labelledby="bot-alerts-heading"
        >
          <div className="section-heading">
            <h2 id="bot-alerts-heading">Alertas Abiertas ({alerts.length})</h2>
          </div>

          {canControl ? (
            <div className="user-actions-buttons">
              <button
                className="secondary-button"
                disabled={busy !== ''}
                onClick={() =>
                  void onSendCommand(
                    instance,
                    { type: 'RESOLVE_ALL_ALERTS' },
                    'Se solicitó resolver todas las alertas abiertas.',
                  )
                }
                type="button"
              >
                Resolver todas las alertas
              </button>
            </div>
          ) : null}

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Severidad</th>
                  <th scope="col">Mensaje</th>
                  <th scope="col">Cuenta</th>
                  <th scope="col">Fecha</th>
                  {canControl ? <th scope="col">Acción</th> : null}
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td data-label="Severidad">
                      <span
                        className="status-badge"
                        data-tone={
                          alert.severity === 'critical' ||
                          alert.severity === 'error'
                            ? 'cancelled'
                            : 'warning'
                        }
                      >
                        {alert.severity}
                      </span>
                    </td>
                    <td data-label="Mensaje">
                      <strong>{alert.message}</strong>
                      {alert.code ? <span>Código: {alert.code}</span> : null}
                    </td>
                    <td data-label="Cuenta">{alert.account || 'General'}</td>
                    <td data-label="Fecha">{formatDate(alert.createdAt)}</td>
                    {canControl ? (
                      <td data-label="Acción">
                        <button
                          className="table-action"
                          disabled={busy !== ''}
                          onClick={() =>
                            void onSendCommand(
                              instance,
                              {
                                id: alert.id,
                                type: 'RESOLVE_ALERT',
                              },
                              'Se solicitó resolver la alerta.',
                            )
                          }
                          type="button"
                        >
                          Resolver
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="detail-section" aria-labelledby="bot-leads-heading">
        <div className="section-heading">
          <h2 id="bot-leads-heading">
            Leads e Interesados de Marketplace (14 días)
          </h2>
        </div>

        <div className="kpi-grid">
          <article className="kpi-card">
            <span className="kpi-label">Interesados (14d)</span>
            <strong className="kpi-value">{leads.total14d}</strong>
            <span className="kpi-note">
              Conversaciones detectadas en 14 días
            </span>
          </article>

          <article className="kpi-card">
            <span className="kpi-label">Chats por responder</span>
            <strong
              className="kpi-value"
              data-tone={leads.awaitingReply > 0 ? 'warning' : undefined}
            >
              {leads.awaitingReply}
            </strong>
            <span className="kpi-note">
              Esperando respuesta del equipo comercial
            </span>
          </article>

          <article className="kpi-card">
            <span className="kpi-label">Recientes sin respuesta (3d)</span>
            <strong
              className="kpi-value"
              data-tone={leads.unansweredRecent > 0 ? 'danger' : undefined}
            >
              {leads.unansweredRecent}
            </strong>
            <span className="kpi-note">
              Prioridad alta de atención inmediata
            </span>
          </article>

          <article className="kpi-card">
            <span className="kpi-label">Productos con actividad</span>
            <strong className="kpi-value">{leads.products.length}</strong>
            <span className="kpi-note">
              Con seguimiento de clics y conversión
            </span>
          </article>
        </div>

        <div className="work-panel">
          <h3>Chats sin responder ({leads.unanswered.length})</h3>
          {leads.unanswered.length === 0 ? (
            <p>
              No hay conversaciones pendientes de respuesta en este momento.
            </p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Conversación / Comprador</th>
                    <th scope="col">Anuncio</th>
                    <th scope="col">Cuenta</th>
                    <th scope="col">Iniciado</th>
                    <th scope="col">Última actividad</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.unanswered.map((thread, idx) => (
                    <tr
                      key={`${thread.account}-${thread.title}-${String(idx)}`}
                    >
                      <td data-label="Conversación / Comprador">
                        <strong>{thread.label || 'Comprador'}</strong>
                        {thread.neverAnswered ? (
                          <span>
                            <span className="status-badge" data-tone="warning">
                              Nunca respondido
                            </span>
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Anuncio">{thread.title || '—'}</td>
                      <td data-label="Cuenta">{thread.account || '—'}</td>
                      <td data-label="Iniciado">{thread.startedOn || '—'}</td>
                      <td data-label="Última actividad">
                        {thread.lastActivity || 'Reciente'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="work-panel">
          <h3>Rendimiento y conversión por producto (14 días)</h3>
          {leads.products.length === 0 ? (
            <p>Todavía no hay métricas de conversión por producto.</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Producto</th>
                    <th scope="col">Activos</th>
                    <th scope="col">Clics (14d)</th>
                    <th scope="col">Leads (14d)</th>
                    <th scope="col">Leads / 100 clics</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.products.map((row) => (
                    <tr key={row.familyKey}>
                      <td data-label="Producto">
                        <strong>{row.label}</strong>
                        {row.focus ? (
                          <span>
                            <span
                              className="status-badge"
                              data-tone="completed"
                            >
                              Enfoque
                            </span>
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Activos" data-numeric="true">
                        {row.activeListings}
                      </td>
                      <td data-label="Clics (14d)" data-numeric="true">
                        {row.clicks14d}
                      </td>
                      <td data-label="Leads (14d)" data-numeric="true">
                        {row.leads14d}
                      </td>
                      <td data-label="Leads / 100 clics" data-numeric="true">
                        {row.leadsPer100Clicks !== null
                          ? `${row.leadsPer100Clicks}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="detail-section" aria-labelledby="bot-queue-heading">
        <div className="section-heading">
          <h2 id="bot-queue-heading">Calendario y Cola de Publicación</h2>
        </div>

        <div className="kpi-grid">
          <article className="kpi-card">
            <span className="kpi-label">Propuestas (planned)</span>
            <strong className="kpi-value">{plannedCount}</strong>
            <span className="kpi-note">Esperando aprobación</span>
          </article>
          <article className="kpi-card">
            <span className="kpi-label">En cola / Aprobadas</span>
            <strong className="kpi-value">{approvedCount}</strong>
            <span className="kpi-note">Listas para publicar en su ventana</span>
          </article>
          <article className="kpi-card">
            <span className="kpi-label">Publicadas</span>
            <strong className="kpi-value">{publishedCount}</strong>
            <span className="kpi-note">Completadas por el calendario</span>
          </article>
          <article className="kpi-card">
            <span className="kpi-label">Bloqueadas / Fallidas</span>
            <strong
              className="kpi-value"
              data-tone={blockedOrFailedCount > 0 ? 'warning' : undefined}
            >
              {blockedOrFailedCount}
            </strong>
            <span className="kpi-note">
              Bloqueadas: {queue.summary.blocked ?? 0} · Fallidas:{' '}
              {queue.summary.failed ?? 0}
            </span>
          </article>
        </div>

        {canControl && unapprovedQueueIds.length > 0 ? (
          <div className="user-actions-buttons">
            <button
              className="primary-button"
              disabled={busy !== ''}
              onClick={() =>
                void onSendCommand(
                  instance,
                  {
                    ids: unapprovedQueueIds,
                    type: 'APPROVE_QUEUE_ITEMS',
                  },
                  'Se solicitó aprobar las publicaciones propuestas en la cola.',
                )
              }
              type="button"
            >
              Aprobar propuestas ({unapprovedQueueIds.length})
            </button>
          </div>
        ) : null}

        {queue.upcoming.length === 0 ? (
          <section className="work-panel">
            <p>No hay publicaciones próximas en la cola del calendario.</p>
          </section>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Programado</th>
                  <th scope="col">Producto / Título</th>
                  <th scope="col">Cuenta</th>
                  <th scope="col">Estado</th>
                  {canControl ? <th scope="col">Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {queue.upcoming.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Programado">
                      {formatBotLocalTime(item.scheduledAt)}
                    </td>
                    <td data-label="Producto / Título">
                      <strong>{item.name}</strong>
                      {item.detail ? <span>{item.detail}</span> : null}
                    </td>
                    <td data-label="Cuenta">{item.account}</td>
                    <td data-label="Estado">
                      <span
                        className="status-badge"
                        data-tone={
                          item.status === 'running'
                            ? 'transit'
                            : item.approved
                              ? 'completed'
                              : 'warning'
                        }
                      >
                        {queueStatusLabels[item.status] ?? item.status}
                      </span>
                    </td>
                    {canControl ? (
                      <td data-label="Acciones">
                        <div className="user-actions-buttons">
                          {!item.approved && item.status === 'planned' ? (
                            <button
                              className="table-action"
                              disabled={busy !== ''}
                              onClick={() =>
                                void onSendCommand(
                                  instance,
                                  {
                                    action: 'approve',
                                    id: item.id,
                                    type: 'QUEUE_ITEM_ACTION',
                                  },
                                  'Se solicitó aprobar el ítem de la cola.',
                                )
                              }
                              type="button"
                            >
                              Aprobar
                            </button>
                          ) : null}
                          {item.status === 'failed' ||
                          item.status === 'blocked' ? (
                            <button
                              className="table-action"
                              disabled={busy !== ''}
                              onClick={() =>
                                void onSendCommand(
                                  instance,
                                  {
                                    action: 'retry',
                                    id: item.id,
                                    type: 'QUEUE_ITEM_ACTION',
                                  },
                                  'Se solicitó reintentar el ítem de la cola.',
                                )
                              }
                              type="button"
                            >
                              Reintentar
                            </button>
                          ) : null}
                          {canMoveQueueItem(item) ? (
                            <QueueItemTimeControls
                              busy={busy !== ''}
                              item={item}
                              onSend={send}
                            />
                          ) : null}
                          {item.status !== 'published' &&
                          item.status !== 'cancelled' &&
                          item.status !== 'running' ? (
                            <button
                              className="table-action"
                              disabled={busy !== ''}
                              onClick={() =>
                                void onSendCommand(
                                  instance,
                                  {
                                    action: 'cancel',
                                    id: item.id,
                                    type: 'QUEUE_ITEM_ACTION',
                                  },
                                  'Se solicitó cancelar el ítem de la cola.',
                                )
                              }
                              type="button"
                            >
                              Cancelar
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className="detail-section"
        aria-labelledby="bot-listings-heading"
      >
        <div className="section-heading">
          <h2 id="bot-listings-heading">
            Anuncios Publicados y Recomendaciones
          </h2>
        </div>

        <div className="kpi-grid">
          <article className="kpi-card">
            <span className="kpi-label">Anuncios activos</span>
            <strong className="kpi-value">{listings.totalActive}</strong>
            <span className="kpi-note">
              En lista actual: {listings.items.length}
            </span>
          </article>
          <article className="kpi-card">
            <span className="kpi-label">Con acción recomendada</span>
            <strong
              className="kpi-value"
              data-tone={listings.actionable > 0 ? 'warning' : undefined}
            >
              {listings.actionable}
            </strong>
            <span className="kpi-note">
              Renovar, republicar, retirar o actualizar stock
            </span>
          </article>
        </div>

        {listings.items.length === 0 ? (
          <section className="work-panel">
            <p>Todavía no hay anuncios rastreados en esta instancia.</p>
          </section>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Anuncio</th>
                  <th scope="col">Cuenta</th>
                  <th scope="col">Días</th>
                  <th scope="col">Clics (14d)</th>
                  <th scope="col">Leads (14d)</th>
                  <th scope="col">Recomendación</th>
                  {canControl ? <th scope="col">Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {listings.items.map((listing) => {
                  const availableActions = getAvailableListingActions(listing);
                  return (
                    <tr key={listing.key}>
                      <td data-label="Anuncio">
                        <strong>{listing.title}</strong>
                        <span>
                          Estado:{' '}
                          {listing.status === 'unknown'
                            ? 'desconocido'
                            : listing.status}
                          {listing.listedOn ? ` · ${listing.listedOn}` : ''}
                        </span>
                      </td>
                      <td data-label="Cuenta">{listing.account}</td>
                      <td data-label="Días" data-numeric="true">
                        {listing.ageDays ?? '—'}
                      </td>
                      <td data-label="Clics (14d)" data-numeric="true">
                        {listing.clicks14d ?? 0}
                      </td>
                      <td data-label="Leads (14d)" data-numeric="true">
                        {listing.leads14d ?? 0}
                      </td>
                      <td data-label="Recomendación">
                        <span
                          className="status-badge"
                          data-tone={
                            listing.recommendation === 'keep'
                              ? 'completed'
                              : 'warning'
                          }
                        >
                          {listing.recommendationLabel ||
                            listing.recommendation}
                        </span>
                        {listing.recommendationReason ? (
                          <span>{listing.recommendationReason}</span>
                        ) : null}
                        {listing.pendingAction ? (
                          <span>
                            Acción en cola:{' '}
                            <strong>{listing.pendingAction}</strong>
                          </span>
                        ) : null}
                      </td>
                      {canControl ? (
                        <td data-label="Acciones">
                          {availableActions.length === 0 ? (
                            getListingActionsEmptyLabel(listing)
                          ) : (
                            <div className="user-actions-buttons">
                              {availableActions.map((action) => (
                                <button
                                  className="table-action"
                                  disabled={busy !== ''}
                                  key={action}
                                  onClick={() =>
                                    void onSendCommand(
                                      instance,
                                      {
                                        action,
                                        key: listing.key,
                                        type: 'LISTING_ACTION',
                                      },
                                      `Se encoló "${listingActionLabels[action]}" para ${listing.title}.`,
                                    )
                                  }
                                  type="button"
                                >
                                  {listingActionLabels[action]}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className="detail-section"
        aria-labelledby="bot-commands-heading"
      >
        <div className="section-heading">
          <h2 id="bot-commands-heading">Historial de Comandos Remotos</h2>
        </div>

        {instance.commands.length === 0 ? (
          <section className="work-panel">
            <p>Todavía no se han enviado comandos remotos a esta instancia.</p>
          </section>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Comando</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Solicitado por</th>
                  <th scope="col">Enviado</th>
                  <th scope="col">Resultado</th>
                  {canControl ? <th scope="col">Acción</th> : null}
                </tr>
              </thead>
              <tbody>
                {instance.commands.map((cmd) => (
                  <tr key={cmd.id}>
                    <td data-label="Comando">
                      <strong>{commandLabels[cmd.type]}</strong>
                    </td>
                    <td data-label="Estado">
                      <span
                        className="status-badge"
                        data-tone={commandStatusTones[cmd.status]}
                      >
                        {commandStatusLabels[cmd.status]}
                      </span>
                    </td>
                    <td data-label="Solicitado por">
                      {cmd.createdByName || '—'}
                    </td>
                    <td data-label="Enviado">{formatDate(cmd.createdAt)}</td>
                    <td data-label="Resultado">
                      {cmd.resultDetail ??
                        (cmd.status === 'PENDING'
                          ? 'Se ejecutará en el próximo pulso del bot'
                          : cmd.status === 'DISPATCHED'
                            ? 'Entregado al bot · esperando confirmación'
                            : '—')}
                    </td>
                    {canControl ? (
                      <td data-label="Acción">
                        {cmd.status === 'PENDING' ? (
                          <button
                            className="table-action"
                            disabled={busy !== ''}
                            onClick={() => void onCancelCommand(cmd.id)}
                            type="button"
                          >
                            Cancelar
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
