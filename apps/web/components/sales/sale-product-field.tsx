'use client';
import type { ProductInventoryView } from '@sgi/contracts';
import { useId, useMemo, useState } from 'react';

/**
 * Accent- and case-insensitive so "cafe" finds "Café" and the operator does not
 * have to reproduce the exact spelling of a code or description.
 */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Matches shown per step. The list used to stop at the first eight with no
 * sign that more existed, so a product ranked ninth could not be chosen
 * without guessing a more precise search. The count is now stated and the
 * operator can reveal more.
 */
const matchesPerStep = 8;

/**
 * The sale dialog already holds the whole sellable inventory with its balances,
 * so the search filters what is in memory: it answers as the operator types and
 * cannot offer a product whose stock this dialog does not know.
 */
export function SaleProductField({
  formatQuantity,
  inventory,
  onSelect,
  value,
}: Readonly<{
  formatQuantity: (quantity: string) => string;
  inventory: readonly ProductInventoryView[];
  onSelect: (productId: string) => void;
  value: string;
}>) {
  const listId = useId();
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(matchesPerStep);
  const selected =
    inventory.find((entry) => entry.product.id === value) ?? null;
  const allMatches = useMemo(() => {
    const needle = normalize(search.trim());
    if (!needle) return [];
    return inventory.filter(
      ({ product }) =>
        normalize(product.code).includes(needle) ||
        normalize(product.name).includes(needle),
    );
  }, [inventory, search]);
  const matches = allMatches.slice(0, limit);

  if (selected) {
    const stocked = selected.balances.filter(
      (balance) => Number(balance.quantity) > 0,
    );
    return (
      <div className="sale-line-product">
        <span className="sale-product-caption">Producto</span>
        <p className="sale-product-chosen">
          <strong>{selected.product.code}</strong> · {selected.product.name}
          {selected.product.unit ? ` · ${selected.product.unit.name}` : ''}
        </p>
        <p className="sale-product-stock">
          {stocked.length === 0
            ? 'Sin existencias en ninguna bodega.'
            : stocked
                .map(
                  (balance) =>
                    `${balance.warehouse.name}: ${formatQuantity(balance.quantity)}`,
                )
                .join(' · ')}
        </p>
        <button
          className="secondary-button"
          onClick={() => {
            setSearch('');
            onSelect('');
          }}
          type="button"
        >
          Cambiar producto
        </button>
      </div>
    );
  }

  return (
    <div className="sale-line-product">
      <label>
        <span>Producto</span>
        <input
          aria-controls={listId}
          autoComplete="off"
          onChange={(event) => {
            setSearch(event.target.value);
            setLimit(matchesPerStep);
          }}
          placeholder="Código o nombre"
          type="search"
          value={search}
        />
      </label>
      {search.trim() === '' ? null : matches.length === 0 ? (
        <p className="sale-product-empty" id={listId} role="status">
          No hay productos que coincidan con «{search.trim()}».
        </p>
      ) : (
        <ul className="picker-results" id={listId}>
          {matches.map((entry) => {
            const available = entry.balances.reduce(
              (total, balance) => total + Number(balance.quantity),
              0,
            );
            return (
              <li key={entry.product.id}>
                <button
                  className="picker-result"
                  onClick={() => onSelect(entry.product.id)}
                  type="button"
                >
                  <strong>{entry.product.code}</strong>
                  <span>{entry.product.name}</span>
                  <span>
                    {available > 0
                      ? `Disponible: ${formatQuantity(String(available))}`
                      : 'Sin existencias'}
                  </span>
                </button>
              </li>
            );
          })}
          <li className="picker-results-summary">
            <span role="status">
              {matches.length === allMatches.length
                ? `${String(allMatches.length)} coincidencia${allMatches.length === 1 ? '' : 's'}`
                : `Mostrando ${String(matches.length)} de ${String(allMatches.length)} coincidencias`}
            </span>
            {matches.length < allMatches.length ? (
              <button
                className="secondary-button"
                onClick={() => setLimit((current) => current + matchesPerStep)}
                type="button"
              >
                Ver más coincidencias
              </button>
            ) : null}
          </li>
        </ul>
      )}
    </div>
  );
}
