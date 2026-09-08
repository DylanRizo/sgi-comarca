'use client';

import type { ProductGroupView } from '@sgi/contracts';
import { useRef, useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { stockOperationsApi } from '@/lib/http/stock-operations-api';
import { useAuth } from '@/providers/auth-provider';

/**
 * Categories are created where they are needed: halfway through loading a
 * product, without leaving the form and losing what is already typed. The new
 * category is selected straight away, so the interruption costs one field.
 *
 * `useStockMutation` is deliberately not used: it completes once and refuses
 * further work, which suits a single submit but not an action repeated while
 * a catalogue is being loaded. The idempotency key is kept across retries of
 * the same name so a lost response cannot create the category twice.
 */
export function CategoryCreator({
  onCreated,
}: Readonly<{ onCreated: (group: ProductGroupView) => void }>) {
  const { getCsrfToken } = useAuth();
  const key = useRef(crypto.randomUUID());
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const created = await stockOperationsApi.createGroup(
        name.trim(),
        await getCsrfToken(),
        key.current,
      );
      key.current = crypto.randomUUID();
      onCreated(created);
      setName('');
      setOpen(false);
    } catch (failure) {
      setError(
        failure instanceof ApiHttpError && failure.status === 409
          ? 'Ya existe una categoría con ese nombre.'
          : 'No pudimos crear la categoría. Revisa el nombre y tus permisos.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        className="link-button"
        onClick={() => setOpen(true)}
        type="button"
      >
        ¿Falta una categoría? Crear una
      </button>
    );
  }

  return (
    <div className="category-creator">
      <label>
        <span>Nombre de la categoría</span>
        <input
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          placeholder="Bebidas, Limpieza, Abarrotes…"
          value={name}
        />
      </label>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="category-creator-actions">
        <button
          className="secondary-button"
          disabled={busy || name.trim().length < 2}
          onClick={() => void create()}
          type="button"
        >
          {busy ? 'Creando…' : 'Crear categoría'}
        </button>
        <button
          className="link-button"
          onClick={() => {
            setName('');
            setError('');
            setOpen(false);
          }}
          type="button"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
