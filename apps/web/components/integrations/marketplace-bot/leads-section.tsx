import type { MonitorSectionProps } from './section-props';

export function LeadsSection({
  instance,
}: Pick<MonitorSectionProps, 'instance'>) {
  const { leads } = instance.snapshot;

  return (
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
          <span className="kpi-note">Conversaciones detectadas en 14 días</span>
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
          <span className="kpi-note">Prioridad alta de atención inmediata</span>
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
          <p>No hay conversaciones pendientes de respuesta en este momento.</p>
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
                  <tr key={`${thread.account}-${thread.title}-${String(idx)}`}>
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
                          <span className="status-badge" data-tone="completed">
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
  );
}
