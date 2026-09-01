'use client';

import type {
  FinanceLineView,
  FinancialCategoryView,
  FinancialEntryType,
} from '@sgi/contracts';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { ApiHttpError } from '@/lib/http/api-client';
import { financesApi } from '@/lib/http/finances-api';
import { entryPreview } from '@/lib/finances/entry-preview';
import { entryTypeLabel } from '@/lib/finances/presentation';
import { useAuth } from '@/providers/auth-provider';
import { useModalDialog } from '@/lib/use-modal-dialog';

function createEntryError(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'FINANCE_CATEGORY_INVALID') {
      return 'La categoría no está disponible o no corresponde al tipo elegido.';
    }
    if (error.code === 'FINANCE_RESPONSIBLE_INVALID') {
      return 'El responsable elegido no está disponible.';
    }
    if (error.code === 'IDEMPOTENCY_KEY_REUSED') {
      return 'La intención cambió durante el envío. Vuelve a intentarlo.';
    }
    if (error.status === 401) return 'La sesión ya no es válida.';
    if (error.status === 403)
      return 'No tienes permiso para registrar asientos.';
    if (error.status === 409) {
      return 'El asiento entró en conflicto con otro cambio. Vuelve a intentarlo.';
    }
    if (error.status === 400)
      return 'Revisa el monto, la fecha y la categoría.';
  }
  return 'No fue posible registrar el asiento. No se reintentará automáticamente.';
}

/** The business date defaults to today in the operating timezone. */
function todayInManagua(): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Managua',
    year: 'numeric',
  }).format(new Date());
}

export function CreateEntryDialog({
  onCancel,
  onSuccess,
}: Readonly<{
  onCancel: () => void;
  onSuccess: (line: FinanceLineView) => void;
}>) {
  const { getCsrfToken, state: authState } = useAuth();
  const currentUserId =
    authState.kind === 'authenticated' ? authState.session.userId : '';
  const submissionRef = useRef(false);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const [amount, setAmount] = useState('');
  const [businessDate, setBusinessDate] = useState(todayInManagua);
  const [categories, setCategories] = useState<
    readonly FinancialCategoryView[]
  >([]);
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [entryType, setEntryType] = useState<FinancialEntryType>('EXPENSE');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // No user directory endpoint exists yet, so it defaults to the actor
  // creating the entry; the field stays editable to name someone else by id.
  const [responsibleUserId, setResponsibleUserId] = useState(currentUserId);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    financesApi
      .categories(controller.signal)
      .then((loaded) => setCategories(loaded))
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(createEntryError(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const availableCategories = categories.filter(
    (category) => category.entryType === entryType && category.active,
  );
  const preview = entryPreview(amount);
  const canSubmit =
    preview.kind === 'valid' &&
    categoryId.length > 0 &&
    responsibleUserId.trim().length > 0 &&
    !submitting &&
    !loading;

  function changeIntent(action: () => void) {
    action();
    setError(null);
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || preview.kind !== 'valid' || submissionRef.current) return;
    submissionRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const trimmedDescription = description.trim();
      const line = await financesApi.createEntry(
        {
          amount: preview.amount,
          businessDate,
          categoryId,
          ...(trimmedDescription ? { description: trimmedDescription } : {}),
          entryType,
          responsibleUserId: responsibleUserId.trim(),
        },
        await getCsrfToken(),
        idempotencyKeyRef.current,
      );
      idempotencyKeyRef.current = crypto.randomUUID();
      onSuccess(line);
    } catch (submissionError) {
      setError(createEntryError(submissionError));
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  // FASE 10B. Escape, focus trap and focus restoration for this
  // aria-modal dialog; disabled while a submission is in flight, matching
  // the close control.
  const dialogRef = useModalDialog<HTMLElement>(onCancel, !submitting);

  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="create-entry-title"
        aria-modal="true"
        className="adjustment-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <h2 id="create-entry-title">Registrar asiento</h2>
          <p>
            Solo los movimientos manuales se guardan aquí. Los ingresos de
            ventas se calculan al consultar y nunca se duplican.
          </p>
        </header>

        {loading ? (
          <p>Cargando categorías…</p>
        ) : (
          <form onSubmit={submit}>
            <div className="sale-form-grid">
              <label className="filter-field">
                <span>Fecha</span>
                <input
                  onChange={(event) =>
                    changeIntent(() => setBusinessDate(event.target.value))
                  }
                  required
                  type="date"
                  value={businessDate}
                />
              </label>
              <label className="filter-field">
                <span>Tipo</span>
                <select
                  onChange={(event) =>
                    changeIntent(() => {
                      setEntryType(event.target.value as FinancialEntryType);
                      setCategoryId('');
                    })
                  }
                  value={entryType}
                >
                  <option value="EXPENSE">{entryTypeLabel('EXPENSE')}</option>
                  <option value="INCOME">{entryTypeLabel('INCOME')}</option>
                </select>
              </label>
              <label className="filter-field">
                <span>Monto (C$)</span>
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    changeIntent(() => setAmount(event.target.value))
                  }
                  placeholder="0.00"
                  value={amount}
                />
              </label>
            </div>

            <label className="filter-field">
              <span>Categoría</span>
              <select
                onChange={(event) =>
                  changeIntent(() => setCategoryId(event.target.value))
                }
                value={categoryId}
              >
                <option value="">Selecciona…</option>
                {availableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field">
              <span>ID del responsable</span>
              <input
                onChange={(event) =>
                  changeIntent(() => setResponsibleUserId(event.target.value))
                }
                placeholder="UUID del usuario responsable"
                value={responsibleUserId}
              />
            </label>
            <p className="field-help">
              Se completa con tu propio usuario. Cámbialo sólo si conoces el
              identificador de otro responsable.
            </p>

            <label className="filter-field">
              <span>Descripción (opcional)</span>
              <input
                maxLength={500}
                onChange={(event) =>
                  changeIntent(() => setDescription(event.target.value))
                }
                value={description}
              />
            </label>

            {preview.kind === 'invalid' ? (
              <div className="form-feedback" data-tone="warning" role="status">
                El monto debe ser mayor que cero, con máximo 2 decimales.
              </div>
            ) : preview.kind === 'zero' ? (
              <div className="form-feedback" data-tone="warning" role="status">
                El monto no puede ser cero.
              </div>
            ) : null}

            {error ? (
              <div className="form-feedback" data-tone="error" role="alert">
                {error}
              </div>
            ) : null}

            <footer className="dialog-actions">
              <button
                className="secondary-button"
                onClick={onCancel}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                disabled={!canSubmit}
                type="submit"
              >
                {submitting ? 'Registrando…' : 'Registrar asiento'}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
