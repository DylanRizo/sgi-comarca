import {
  commandLabels,
  commandStatusLabels,
  commandStatusTones,
  formatDate,
} from './presentation';
import type { MonitorSectionProps } from './section-props';

export function CommandsSection({
  busy,
  canControl,
  instance,
  onCancelCommand,
}: Pick<
  MonitorSectionProps,
  'busy' | 'canControl' | 'instance' | 'onCancelCommand'
>) {
  return (
    <section className="detail-section" aria-labelledby="bot-commands-heading">
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
  );
}
