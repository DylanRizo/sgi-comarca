import type { ProductInventoryView } from '@sgi/contracts';
import type { Route } from 'next';
import Link from 'next/link';

import { formatQuantity } from '@/lib/inventory/presentation';

export function InventorySummaryTable({
  items,
}: Readonly<{ items: readonly ProductInventoryView[] }>) {
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
