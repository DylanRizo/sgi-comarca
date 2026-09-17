'use client';
import type { PaginatedData, ReceiptView } from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { stockOperationsApi } from '@/lib/http/stock-operations-api';
import { formatMoney, formatObservedAt } from '@/lib/inventory/presentation';
import { useAuth } from '@/providers/auth-provider';
import { PaginationControls } from './pagination-controls';

export function ReceiptHistory({
  receiptId,
}: Readonly<{ receiptId?: string }>) {
  const { state: auth } = useAuth();
  const permissions =
    auth.kind === 'authenticated' ? auth.session.permissions : [];
  const [page, setPage] = useState(1),
    [reload, setReload] = useState(0),
    [error, setError] = useState('');
  const [list, setList] = useState<PaginatedData<ReceiptView> | null>(null),
    [detail, setDetail] = useState<ReceiptView | null>(null);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      setList(null);
      setDetail(null);
      setError('');
      void (
        receiptId
          ? stockOperationsApi.receipt(receiptId).then((result) => {
              if (current) setDetail(result);
            })
          : stockOperationsApi.receipts(page).then((result) => {
              if (current) setList(result);
            })
      ).catch(() => {
        if (current) setError('No se pudieron cargar las entradas.');
      });
    }, 0);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [receiptId, page, reload]);
  const items = detail ? [detail] : list?.items;
  return (
    <main id="main-content" className="content-page">
      <header className="page-heading">
        <div>
          <h1>
            {receiptId ? 'Comprobante de entrada' : 'Entradas de inventario'}
          </h1>
          <p>
            Documentos de recepción. Sus cantidades y valores históricos no se
            reescriben.
          </p>
        </div>
        {permissions.includes('stock-receipts.create') ? (
          <Link
            href={'/inventory/receipts/new' as Route}
            className="primary-button"
          >
            Registrar entrada
          </Link>
        ) : null}
      </header>
      {error ? (
        <p role="alert">
          {error}{' '}
          <button
            className="secondary-button"
            onClick={() => setReload((value) => value + 1)}
          >
            Reintentar
          </button>
        </p>
      ) : !items ? (
        <p role="status">Cargando entradas…</p>
      ) : items.length === 0 ? (
        <section className="work-panel">
          <h2>Todavía no hay entradas</h2>
          <p>Registra la primera recepción para comenzar el historial.</p>
        </section>
      ) : (
        items.map((receipt) => (
          <article className="work-panel" key={receipt.id}>
            <header className="section-heading">
              <div>
                <h2>Entrada del {formatObservedAt(receipt.occurredAt)}</h2>
                <p>
                  {receipt.actor.displayName} · {receipt.reason}
                </p>
              </div>
              {!receiptId ? (
                <Link
                  className="table-link"
                  href={`/inventory/receipts/${receipt.id}` as Route}
                >
                  Ver comprobante
                </Link>
              ) : null}
            </header>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Bodega</th>
                    <th>Cantidad</th>
                    <th>Saldo anterior</th>
                    <th>Saldo posterior</th>
                    {permissions.includes('finances.read') ? (
                      <th>Costo registrado</th>
                    ) : null}
                    <th>Precio registrado</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Producto">
                        <Link href={`/products/${item.product.id}` as Route}>
                          {item.product.code} · {item.product.name}
                        </Link>
                      </td>
                      <td data-label="Bodega">{item.warehouse.name}</td>
                      <td data-label="Cantidad">{item.quantity}</td>
                      <td data-label="Anterior">{item.balanceBefore}</td>
                      <td data-label="Posterior">{item.balanceAfter}</td>
                      {permissions.includes('finances.read') ? (
                        <td data-label="Costo">
                          {item.unitCost === null
                            ? 'Pendiente al recibir'
                            : formatMoney(item.unitCost)}
                        </td>
                      ) : null}
                      <td data-label="Precio">
                        {item.unitPrice === null
                          ? 'Pendiente al recibir'
                          : formatMoney(item.unitPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))
      )}
      {list ? (
        <PaginationControls pagination={list.pagination} onPage={setPage} />
      ) : null}
      {receiptId ? (
        <Link className="back-link" href={'/inventory/receipts' as Route}>
          Todas las entradas
        </Link>
      ) : null}
    </main>
  );
}
