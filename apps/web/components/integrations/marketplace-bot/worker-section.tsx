import {
  connectionLabels,
  connectionTones,
  safetyLabels,
  formatDate,
  formatSafetyLevel,
} from './presentation';
import type { MonitorSectionProps } from './section-props';

export function WorkerSection({
  busy,
  canControl,
  instance,
  onSendCommand,
}: Pick<
  MonitorSectionProps,
  'busy' | 'canControl' | 'instance' | 'onSendCommand'
>) {
  const { worker, accounts, alerts } = instance.snapshot;

  return (
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

            {(['conservative', 'balanced', 'active'] as const).map((level) => (
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
            ))}
          </div>
        </div>
      ) : null}

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
  );
}
