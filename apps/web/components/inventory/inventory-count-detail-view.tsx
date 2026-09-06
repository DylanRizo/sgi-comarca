'use client';
import type {
  InventoryCountLineView,
  InventoryCountSessionView,
  ProductSummary,
} from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiHttpError } from '@/lib/http/api-client';
import { inventoryCountsApi } from '@/lib/http/inventory-counts-api';
import { useAuth } from '@/providers/auth-provider';
import { FormField } from '@/components/ui/form-field';
import { ProductPicker } from './product-picker';

const labels = {
  OPEN: 'En curso',
  PENDING_APPROVAL: 'Por aprobar',
  APPROVED: 'Aprobado',
  CANCELLED: 'Cancelado',
} as const;
function errorMessage(error: unknown) {
  if (error instanceof ApiHttpError) {
    if (error.code === 'INVENTORY_COUNT_BALANCE_CHANGED')
      return 'Hubo movimientos posteriores al conteo. La aprobación fue rechazada completa: cancela esta sesión, crea otra y vuelve a contar con los saldos actuales.';
    if (error.code === 'INVENTORY_COUNT_CONFLICT')
      return 'Otra persona corrigió esta línea. Actualiza la sesión para ver su versión y vuelve a intentarlo.';
    return error.message;
  }
  return 'No pudimos confirmar la operación. Tus datos siguen en pantalla para que puedas reintentar.';
}
function CountCorrection({
  line,
  sessionId,
  onSaved,
}: Readonly<{
  line: InventoryCountLineView;
  sessionId: string;
  onSaved: () => void;
}>) {
  const { getCsrfToken } = useAuth();
  const [quantity, setQuantity] = useState(line.countedQuantity),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [uncertain, setUncertain] = useState(false);
  const key = useRef(crypto.randomUUID()),
    running = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await inventoryCountsApi.correctLine(
        sessionId,
        line.id,
        { countedQuantity: quantity, expectedVersion: line.version, reason },
        await getCsrfToken(),
        key.current,
      );
      onSaved();
    } catch (failure) {
      const ambiguous =
        !(failure instanceof ApiHttpError) || failure.status >= 500;
      setUncertain(ambiguous);
      setError(errorMessage(failure));
      if (!ambiguous) key.current = crypto.randomUUID();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="work-form" onSubmit={submit}>
      <h3>Corregir {line.product.code}</h3>
      <p>
        Esperado original: {line.expectedQuantity}. Este valor no se
        recalculará.
      </p>
      <fieldset disabled={busy || uncertain}>
        <div className="form-grid">
          <FormField label="Cantidad contada corregida">
            <input
              required
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </FormField>
          <FormField label="Motivo de la corrección">
            <input
              required
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </FormField>
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="inline-error">
          {error}
        </p>
      ) : null}
      <button
        className="primary-button"
        disabled={busy || !reason.trim() || quantity === line.countedQuantity}
        type="submit"
      >
        {busy
          ? 'Guardando…'
          : uncertain
            ? 'Reintentar sin duplicar'
            : 'Guardar corrección'}
      </button>
    </form>
  );
}

export function InventoryCountDetailView({ id }: Readonly<{ id: string }>) {
  const { getCsrfToken, state } = useAuth();
  const [session, setSession] = useState<InventoryCountSessionView | null>(
      null,
    ),
    [loadError, setLoadError] = useState(''),
    [reload, setReload] = useState(0);
  const [product, setProduct] = useState<ProductSummary | null>(null),
    [warehouseId, setWarehouseId] = useState(''),
    [quantity, setQuantity] = useState('');
  const [correction, setCorrection] = useState<InventoryCountLineView | null>(
      null,
    ),
    [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState<{
      tone: 'error' | 'success';
      text: string;
    } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void inventoryCountsApi
      .detail(id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSession(value);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLoadError('No pudimos cargar la sesión.');
      });
    return () => controller.abort();
  }, [id, reload]);
  const permissions =
    state.kind === 'authenticated' ? state.session.permissions : [];
  const canCapture = permissions.includes('inventory.audit.create'),
    canApprove =
      permissions.includes('inventory.audit.approve') &&
      permissions.includes('inventory.adjust');
  async function run(
    action: (csrf: string) => Promise<unknown>,
    success: string,
  ): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setFeedback(null);
    try {
      await action(await getCsrfToken());
      setFeedback({ tone: 'success', text: success });
      setReload((value) => value + 1);
      return true;
    } catch (failure) {
      setFeedback({ tone: 'error', text: errorMessage(failure) });
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (loadError)
    return (
      <main className="content-page" id="main-content">
        <p role="alert">
          {loadError}{' '}
          <button
            className="secondary-button"
            onClick={() => {
              setLoadError('');
              setReload((value) => value + 1);
            }}
          >
            Reintentar
          </button>
        </p>
      </main>
    );
  if (!session)
    return (
      <main className="content-page" id="main-content">
        <p role="status">Cargando conteo…</p>
      </main>
    );
  const open = session.status === 'OPEN',
    pending = session.status === 'PENDING_APPROVAL';
  const currentStep =
    session.status === 'OPEN'
      ? 1
      : session.status === 'PENDING_APPROVAL'
        ? 2
        : 3;
  const totalKnown = session.lines.length + session.pendingItems.length;
  const expected =
    product && warehouseId
      ? (session.pendingItems.find(
          (item) =>
            item.product.id === product.id && item.warehouse.id === warehouseId,
        )?.expectedQuantity ??
        session.lines.find(
          (line) =>
            line.product.id === product.id && line.warehouse.id === warehouseId,
        )?.expectedQuantity ??
        '0')
      : null;
  const already =
    product && warehouseId
      ? session.lines.find(
          (line) =>
            line.product.id === product.id && line.warehouse.id === warehouseId,
        )
      : null;
  return (
    <main className="content-page" id="main-content">
      <Link className="back-link" href={'/inventory/counts' as Route}>
        Volver a Conteos
      </Link>
      <header className="page-heading">
        <div>
          <h1>Conteo del {session.businessDate}</h1>
          <p>{session.reason}</p>
        </div>
        <span className="status-badge">{labels[session.status]}</span>
      </header>
      <ol className="workflow-steps" aria-label="Etapas del conteo">
        {['Preparar', 'Contar', 'Revisar', 'Aprobar'].map((label, index) => (
          <li
            key={label}
            aria-current={currentStep === index ? 'step' : undefined}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <dl className="product-facts">
        <div>
          <dt>Bodegas</dt>
          <dd>
            {session.warehouses.map((warehouse) => warehouse.name).join(', ')}
          </dd>
        </div>
        <div>
          <dt>Progreso conocido</dt>
          <dd>
            {session.lines.length} de {totalKnown || 0}
          </dd>
        </div>
        <div>
          <dt>Pendientes con saldo</dt>
          <dd>{session.pendingItems.length}</dd>
        </div>
        <div>
          <dt>Creado por</dt>
          <dd>{session.createdBy.displayName}</dd>
        </div>
      </dl>
      {feedback ? (
        <p
          className="form-feedback"
          data-tone={feedback.tone}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
        >
          {feedback.text}
        </p>
      ) : null}
      {open && canCapture ? (
        <form
          className="work-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!product) return;
            void run(
              (csrf) =>
                inventoryCountsApi.captureLine(
                  id,
                  {
                    productId: product.id,
                    warehouseId,
                    countedQuantity: quantity,
                  },
                  csrf,
                ),
              'Conteo guardado. Puedes continuar después.',
            ).then((saved) => {
              if (saved) setQuantity('');
            });
          }}
        >
          <h2>2. Contar productos</h2>
          <p>
            Busca cualquier producto del catálogo; la búsqueda funciona por
            páginas y no se limita a los primeros 100.
          </p>
          <ProductPicker
            value={product}
            onChange={(value) => {
              setProduct(value);
              setQuantity('');
            }}
          />
          <div className="form-grid">
            <FormField label="Bodega">
              <select
                required
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
              >
                <option value="">Selecciona una bodega</option>
                {session.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Cantidad contada">
              <input
                required
                inputMode="decimal"
                placeholder="0.0000"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </FormField>
          </div>
          {expected !== null ? (
            <div className="work-panel">
              <h3>Comparación</h3>
              <p>
                Esperado al capturar: {expected} · Contado: {quantity || '—'}
              </p>
              {already ? (
                <p role="alert">
                  Esta combinación ya fue contada. Usa Corregir en la revisión.
                </p>
              ) : null}
            </div>
          ) : null}
          <button
            className="primary-button"
            disabled={
              busy || !product || !warehouseId || !quantity || Boolean(already)
            }
          >
            {busy ? 'Guardando…' : 'Guardar y continuar'}
          </button>
        </form>
      ) : null}
      <section className="detail-section">
        <h2>3. Revisar diferencias</h2>
        {session.lines.length === 0 ? (
          <p>Todavía no hay productos contados.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Bodega</th>
                  <th>Esperado</th>
                  <th>Contado</th>
                  <th>Diferencia</th>
                  <th>Correcciones</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {session.lines.map((line) => (
                  <tr key={line.id}>
                    <td data-label="Producto">
                      {line.product.code}
                      <span>{line.product.name}</span>
                    </td>
                    <td data-label="Bodega">{line.warehouse.name}</td>
                    <td data-label="Esperado">{line.expectedQuantity}</td>
                    <td data-label="Contado">{line.countedQuantity}</td>
                    <td data-label="Diferencia">
                      <strong>{line.difference}</strong>
                    </td>
                    <td data-label="Correcciones">
                      {line.revisions.length ? (
                        <details>
                          <summary>{line.revisions.length} cambio(s)</summary>
                          <ul>
                            {line.revisions.map((revision) => (
                              <li key={revision.id}>
                                {revision.previousCountedQuantity} →{' '}
                                {revision.newCountedQuantity},{' '}
                                {revision.actor.displayName}: {revision.reason}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        'Ninguna'
                      )}
                    </td>
                    <td data-label="Acción">
                      {open && canCapture ? (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setCorrection(line)}
                        >
                          Corregir
                        </button>
                      ) : (
                        'Bloqueado'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {correction ? (
          <CountCorrection
            line={correction}
            sessionId={id}
            onSaved={() => {
              setCorrection(null);
              setFeedback({
                tone: 'success',
                text: 'Corrección guardada con su motivo e historial.',
              });
              setReload((value) => value + 1);
            }}
          />
        ) : null}
        {session.pendingItems.length ? (
          <div className="work-panel">
            <h3>{session.pendingItems.length} pendientes con saldo</h3>
            <p>
              Los productos sin contar conservarán su saldo y no producirán
              ajustes.
            </p>
            <ul>
              {session.pendingItems.slice(0, 25).map((item) => (
                <li key={`${item.product.id}:${item.warehouse.id}`}>
                  {item.product.code} · {item.product.name} —{' '}
                  {item.warehouse.name}: {item.expectedQuantity}
                </li>
              ))}
            </ul>
            {session.pendingItems.length > 25 ? (
              <p>Mostrando 25. Usa la búsqueda para encontrar los demás.</p>
            ) : null}
          </div>
        ) : (
          <p>
            Todos los productos con saldo conocido en el alcance fueron
            contados.
          </p>
        )}
      </section>
      <section className="work-form">
        <h2>4. Enviar y aprobar</h2>
        <p>
          {session.lines.filter((line) => line.difference !== '0').length}{' '}
          diferencia(s) · {session.pendingItems.length} pendiente(s). Revisa
          antes de bloquear el conteo.
        </p>
        <div className="operation-toolbar">
          {open && canCapture ? (
            <button
              className="primary-button"
              disabled={busy || session.lines.length === 0}
              onClick={() =>
                void run(
                  (csrf) => inventoryCountsApi.submit(id, csrf),
                  'Sesión enviada. Las líneas quedaron bloqueadas.',
                )
              }
            >
              Enviar a aprobación
            </button>
          ) : null}
          {pending && canApprove ? (
            <button
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void run(
                  (csrf) => inventoryCountsApi.approve(id, csrf),
                  'Conteo aprobado y ajustes generados.',
                )
              }
            >
              Aprobar y ajustar
            </button>
          ) : null}
        </div>
        {(open || pending) && (canCapture || canApprove) ? (
          <div className="work-panel">
            <FormField label="Motivo de cancelación">
              <input
                maxLength={500}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
              />
            </FormField>
            <button
              className="danger-button"
              disabled={busy || !cancelReason.trim()}
              onClick={() =>
                void run(
                  (csrf) =>
                    inventoryCountsApi.cancel(
                      id,
                      { reason: cancelReason },
                      csrf,
                    ),
                  'Sesión cancelada. Ningún saldo fue modificado.',
                )
              }
            >
              Cancelar sesión
            </button>
          </div>
        ) : null}
        {!open && session.status !== 'PENDING_APPROVAL' ? (
          <p>
            Esta sesión está cerrada; sus líneas y revisiones son de solo
            lectura.
          </p>
        ) : null}
      </section>
    </main>
  );
}
