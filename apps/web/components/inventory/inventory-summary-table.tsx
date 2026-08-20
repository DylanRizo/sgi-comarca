import type {
  InventoryBalanceView,
  ProductDetail,
  ProductInventoryView,
} from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';

import { formatQuantity } from '@/lib/inventory/presentation';

export function InventorySummaryTable({
  canAdjust = false,
  items,
  onAdjust,
}: Readonly<{
  canAdjust?: boolean;
  items: readonly ProductInventoryView[];
  onAdjust?: (product: ProductDetail, balance: InventoryBalanceView) => void;
}>) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col">Unidad</th>
            <th scope="col">Stock total</th>
            <th scope="col">Desglose por almacén</th>
            <th scope="col">Detalle</th>
            {canAdjust ? <th scope="col">Acciones</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.product.id}>
              <td data-label="Producto">
                <strong>{item.product.code}</strong>
                <span>{item.product.name}</span>
              </td>
              <td data-label="Unidad">
                {item.product.unit?.name ?? 'Sin unidad'}
              </td>
              <td data-label="Stock total">
                <strong>{formatQuantity(item.totalQuantity)}</strong>
              </td>
              <td data-label="Desglose">
                <ul className="warehouse-breakdown">
                  {item.balances.map((balance) => (
                    <li key={balance.id}>
                      <span>{balance.warehouse.name}</span>
                      <strong>{formatQuantity(balance.quantity)}</strong>
                    </li>
                  ))}
                </ul>
              </td>
              <td data-label="Detalle">
                <Link
                  className="table-link"
                  href={`/products/${item.product.id}` as Route}
                >
                  Ver producto
                </Link>
              </td>
              {canAdjust ? (
                <td data-label="Acciones">
                  <div className="balance-actions">
                    {item.balances.map((balance) => (
                      <button
                        aria-label={`Ajustar ${item.product.code} en ${balance.warehouse.name}`}
                        className="table-action"
                        key={balance.id}
                        onClick={() => onAdjust?.(item.product, balance)}
                        type="button"
                      >
                        Ajustar {balance.warehouse.code}
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
  );
}
