import { listingActionLabels } from './presentation';
import type { MonitorSectionProps } from './section-props';

export function ListingsSection({
  busy,
  canControl,
  instance,
  onSendCommand,
}: Pick<
  MonitorSectionProps,
  'busy' | 'canControl' | 'instance' | 'onSendCommand'
>) {
  const { listings } = instance.snapshot;

  return (
    <section className="detail-section" aria-labelledby="bot-listings-heading">
      <div className="section-heading">
        <h2 id="bot-listings-heading">Anuncios Publicados y Recomendaciones</h2>
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
              {listings.items.map((listing) => (
                <tr key={listing.key}>
                  <td data-label="Anuncio">
                    <strong>{listing.title}</strong>
                    <span>
                      Estado: {listing.status}
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
                      {listing.recommendationLabel || listing.recommendation}
                    </span>
                    {listing.recommendationReason ? (
                      <span>{listing.recommendationReason}</span>
                    ) : null}
                    {listing.pendingAction ? (
                      <span>
                        Acción en cola: <strong>{listing.pendingAction}</strong>
                      </span>
                    ) : null}
                  </td>
                  {canControl ? (
                    <td data-label="Acciones">
                      <div className="user-actions-buttons">
                        {(
                          [
                            'renew',
                            'relist',
                            'mark_out_of_stock',
                            'delete',
                          ] as const
                        ).map((action) => (
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
