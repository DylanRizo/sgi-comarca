import type { PaginationMeta } from '@sgi/contracts';

export function PaginationControls({
  onPage,
  pagination,
}: Readonly<{
  onPage: (page: number) => void;
  pagination: PaginationMeta;
}>) {
  if (pagination.totalPages <= 1) return null;
  return (
    <nav aria-label="Paginación" className="pagination-controls">
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
