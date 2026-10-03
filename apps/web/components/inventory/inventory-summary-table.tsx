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
      <table className="data-table inventory-summary-table">
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col">Unidad</th>
            <th scope="col">Stock total</th>
            <th scope="col">Desglose por bodega</th>
            <th scope="col">Detalle</th>
            {canAdjust ? <th scope="col">Acciones</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.product.id}>
              <td className="inventory-product-cell" data-label="Producto">
                <strong>{item.product.code}</strong>
                <span className="inventory-product-name">
                  {item.product.name}
                </span>
                <span className="inventory-product-unit">
                  {item.product.unit?.name ?? 'Sin unidad'}
                </span>
              </td>
              <td className="inventory-unit-cell" data-label="Unidad">
                {item.product.unit?.name ?? 'Sin unidad'}
              </td>
              <td className="inventory-total-cell" data-label="Stock total">
                <strong>{formatQuantity(item.totalQuantity)}</strong>
              </td>
              <td className="inventory-breakdown-cell" data-label="Desglose">
                <ul className="warehouse-breakdown">
                  {item.balances.map((balance) => (
                    <li key={balance.id}>
                      <span>{balance.warehouse.name}</span>
                      <strong>{formatQuantity(balance.quantity)}</strong>
                    </li>
                  ))}
                </ul>
              </td>
              <td className="inventory-detail-cell" data-label="Detalle">
                <Link
                  className="table-link"
                  href={`/products/${item.product.id}` as Route}
                >
                  Ver producto
                </Link>
              </td>
              {canAdjust ? (
                <td className="inventory-actions-cell" data-label="Acciones">
                  <div className="balance-actions">
                    {item.balances.map((balance) => (
                      <button
                        aria-label={`Ajustar ${item.product.code} en ${balance.warehouse.name}`}
                        className="table-action"
                        key={balance.id}
                        onClick={() => onAdjust?.(item.product, balance)}
                        type="button"
                      >
                        <span>Ajustar</span>
                        <small>{balance.warehouse.name}</small>
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
