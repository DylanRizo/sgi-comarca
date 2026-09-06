'use client';
import type { PaginatedData, PendingValuation } from '@sgi/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { stockOperationsApi } from '@/lib/http/stock-operations-api';
import { useStockMutation } from '@/lib/inventory/use-stock-mutation';
import { useAuth } from '@/providers/auth-provider';
import { FormField } from '@/components/ui/form-field';
import { PaginationControls } from './pagination-controls';

function ValuationForm({
  item,
  onSaved,
}: Readonly<{ item: PendingValuation; onSaved: () => void }>) {
  const [cost, setCost] = useState(''),
    [price, setPrice] = useState(''),
    [reason, setReason] = useState('');
  const mutation = useStockMutation();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutation.execute(async (key, csrf) => {
      await stockOperationsApi.value(
        item.id,
        {
          expectedVersion: item.version,
          reason,
          ...(cost.trim() ? { unitCost: cost } : {}),
          ...(price.trim() ? { unitPrice: price } : {}),
        },
        csrf,
        key,
      );
      onSaved();
    });
  }
  return (
    <form onSubmit={submit} className="work-form">
      <h2>
        {item.product.code} · {item.product.name}
      </h2>
      <p>
        {item.warehouse.name} · {item.quantity} en existencia
      </p>
      <p>
        Costo vigente: {item.unitCost ?? 'Pendiente'} · Precio vigente:{' '}
        {item.unitPrice ?? 'Pendiente'}. Dejar vacío conserva el vigente.
      </p>
      <fieldset disabled={mutation.busy || mutation.uncertain}>
        <div className="form-grid">
          <FormField label="Costo unitario">
            <input
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
            />
          </FormField>
          <FormField label="Precio de venta">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </FormField>
          <FormField label="Motivo de la valoración">
            <input
              required
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </FormField>
        </div>
      </fieldset>
      {mutation.error ? (
        <p role="alert" className="inline-error">
          {mutation.error}
        </p>
      ) : null}
      <button
        className="primary-button"
        type="submit"
        disabled={mutation.busy || (!cost && !price)}
      >
        {mutation.busy
          ? 'Guardando…'
          : mutation.uncertain
            ? 'Reintentar'
            : 'Guardar valoración'}
      </button>
    </form>
  );
}

export function PendingValuations() {
  const { state } = useAuth();
  const allowed =
    state.kind === 'authenticated' &&
    state.session.permissions.includes('inventory.valuation.manage') &&
    state.session.permissions.includes('finances.read');
  const [page, setPage] = useState(1),
    [reload, setReload] = useState(0),
    [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  // Empty search keeps the pending queue, which is the daily task. A search
  // reaches any product/warehouse, including one already valued.
  const searching = search.trim() !== '';
  const [result, setResult] = useState<PaginatedData<PendingValuation> | null>(
    null,
  );
  useEffect(() => {
    if (!allowed) return;
    let current = true;
    const timer = setTimeout(
      () => {
        setResult(null);
        setError('');
        void (
          searching
            ? stockOperationsApi.valuations(search.trim(), page)
            : stockOperationsApi.pendingValuations(page)
        )
          .then((value) => {
            if (current) setResult(value);
          })
          .catch(() => {
            if (current)
              setError('No pudimos consultar las valoraciones.');
          });
      },
      searching ? 250 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [allowed, page, reload, search, searching]);
  return (
    <main id="main-content" className="content-page">
      <header className="page-heading">
        <div>
          <h1>Valoraciones</h1>
          <p>
            Completa costo y precio por producto y bodega. Se conserva el
            historial; las entradas anteriores no se modifican.
          </p>
        </div>
      </header>
      {allowed ? (
        <FormField
          label="Buscar producto ya valorado"
          hint="Vacío muestra solo lo pendiente. Escribe código o nombre para corregir una valoración existente."
        >
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
      ) : null}
      {success ? <p role="status">{success}</p> : null}
      {!allowed ? (
        <p role="alert">
          Esta tarea requiere permiso de valoración e información financiera.
        </p>
      ) : error ? (
        <p role="alert">
          {error}{' '}
          <button
            className="secondary-button"
            onClick={() => setReload((value) => value + 1)}
          >
            Reintentar
          </button>
        </p>
      ) : !result ? (
        <p role="status">
          {searching ? 'Buscando…' : 'Cargando pendientes…'}
        </p>
      ) : (
        <>
          {result.items.length === 0 ? (
            <section className="work-panel">
              <h2>
                {searching
                  ? 'Ningún producto coincide con esa búsqueda'
                  : 'Sin valoraciones pendientes en esta página'}
              </h2>
              <p>
                {searching
                  ? 'Busca por código o nombre. Solo aparecen productos con saldo en alguna bodega.'
                  : 'Los costos en cero seguirán marcados para revisión.'}
              </p>
            </section>
          ) : (
            result.items.map((item) => (
              <ValuationForm
                item={item}
                key={`${item.id}:${item.version}`}
                onSaved={() => {
                  setSuccess(
                    'Valoración guardada. No se modificó la cantidad de inventario.',
                  );
                  setReload((value) => value + 1);
                }}
              />
            ))
          )}
          <PaginationControls pagination={result.pagination} onPage={setPage} />
        </>
      )}
    </main>
  );
}
