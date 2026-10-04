import type { PaginationMeta } from '@sgi/contracts';

/**
 * A list may render these controls twice. On a phone each row becomes a card,
 * so 25 results run to several thousand pixels and controls placed only after
 * them never appear on screen after a search. Lists therefore repeat them
 * above the results; `label` keeps the two navigation landmarks distinct.
 */
export function PaginationControls({
  label = 'Paginación',
  onPage,
  pagination,
}: Readonly<{
  label?: string;
  onPage: (page: number) => void;
  pagination: PaginationMeta;
}>) {
  if (pagination.totalPages <= 1) return null;
  const first = (pagination.page - 1) * pagination.pageSize + 1;
  const last = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalItems,
  );
  return (
    <nav aria-label={label} className="pagination-controls">
      <button
        className="secondary-button"
        disabled={pagination.page <= 1}
        onClick={() => onPage(pagination.page - 1)}
        type="button"
      >
        Anterior
      </button>
      <span>
        Página {pagination.page} de {pagination.totalPages}
        <small className="pagination-range">
          Mostrando {first}–{last} de {pagination.totalItems}
        </small>
      </span>
      <button
        className="secondary-button"
        disabled={pagination.page >= pagination.totalPages}
        onClick={() => onPage(pagination.page + 1)}
        type="button"
      >
        Siguiente
      </button>
    </nav>
  );
}
