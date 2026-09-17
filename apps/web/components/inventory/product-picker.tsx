'use client';
import type { PaginatedData, ProductSummary } from '@sgi/contracts';
import { useEffect, useState } from 'react';
import { inventoryApi } from '@/lib/http/inventory-api';
import { PaginationControls } from './pagination-controls';
import { FormField } from '@/components/ui/form-field';

export function ProductPicker({
  value,
  onChange,
}: Readonly<{
  value: ProductSummary | null;
  onChange: (product: ProductSummary) => void;
}>) {
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1);
  const [result, setResult] = useState<PaginatedData<ProductSummary> | null>(
    null,
  );
  const [error, setError] = useState(''),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setResult(null);
      setError('');
      void inventoryApi
        .products(
          { search, page, pageSize: 15, active: true },
          controller.signal,
        )
        .then(setResult)
        .catch(() => {
          if (!controller.signal.aborted)
            setError('No se pudo buscar. Reintenta sin perder tu selección.');
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, page, reload]);
  return (
    <section aria-label="Seleccionar producto" className="product-picker">
      <FormField label="Buscar producto">
        <input
          type="search"
          placeholder="Código o nombre"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </FormField>
      {value ? (
        <p role="status">
          Seleccionado:{' '}
          <strong>
            {value.code} · {value.name}
          </strong>
        </p>
      ) : (
        <p>Busca y selecciona el producto de esta operación.</p>
      )}
      {error ? (
        <p role="alert">
          {error}{' '}
          <button
            type="button"
            className="secondary-button"
            onClick={() => setReload((value) => value + 1)}
          >
            Reintentar búsqueda
          </button>
        </p>
      ) : !result ? (
        <p role="status">Buscando productos…</p>
      ) : (
        <>
          {result.items.length === 0 ? (
            <p>No hay productos que coincidan con esta búsqueda.</p>
          ) : (
            <ul className="picker-results">
              {result.items.map((product) => (
                <li key={product.id}>
                  <button
                    className="picker-result"
                    type="button"
                    aria-pressed={value?.id === product.id}
                    onClick={() => onChange(product)}
                  >
                    <strong>{product.code}</strong>
                    <span>{product.name}</span>
                    <span>{product.unit?.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <PaginationControls pagination={result.pagination} onPage={setPage} />
        </>
      )}
    </section>
  );
}
