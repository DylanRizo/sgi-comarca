import { formatDate } from './presentation';
import type { MonitorSectionProps } from './section-props';

export function AlertsSection({
  busy,
  canControl,
  instance,
  onSendCommand,
}: Pick<
  MonitorSectionProps,
  'busy' | 'canControl' | 'instance' | 'onSendCommand'
>) {
  const { alerts } = instance.snapshot;
  if (alerts.length === 0) return null;

  return (
    <section className="detail-section" aria-labelledby="bot-alerts-heading">
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
  );
}
