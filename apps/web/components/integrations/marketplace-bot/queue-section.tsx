import { formatDate } from './presentation';
import type { MonitorSectionProps } from './section-props';

export function QueueSection({
  busy,
  canControl,
  instance,
  onSendCommand,
}: Pick<
  MonitorSectionProps,
  'busy' | 'canControl' | 'instance' | 'onSendCommand'
>) {
  const { queue } = instance.snapshot;
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
                    {formatDate(item.scheduledAt)}
                  </td>
                  <td data-label="Producto / Título">
                    <strong>{item.name}</strong>
                    {item.detail ? <span>{item.detail}</span> : null}
                  </td>
                  <td data-label="Cuenta">{item.account}</td>
                  <td data-label="Estado">
                    <span
                      className="status-badge"
                      data-tone={item.approved ? 'completed' : 'warning'}
                    >
                      {item.status}
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
                        {item.status !== 'published' &&
                        item.status !== 'cancelled' ? (
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
  );
}
