'use client';
import type { WarehouseSummary } from '@sgi/contracts';
import { FormField } from '@/components/ui/form-field';

export interface ReceiptDraft {
  warehouseId: string;
  quantity: string;
  reason: string;
  unitCost: string;
  unitPrice: string;
}
export const emptyReceipt: ReceiptDraft = {
  warehouseId: '',
  quantity: '',
  reason: '',
  unitCost: '',
  unitPrice: '',
};
export function receiptInput(draft: ReceiptDraft) {
  return {
    warehouseId: draft.warehouseId,
    quantity: draft.quantity,
    reason: draft.reason.trim(),
    ...(draft.unitCost.trim() ? { unitCost: draft.unitCost.trim() } : {}),
    ...(draft.unitPrice.trim() ? { unitPrice: draft.unitPrice.trim() } : {}),
  };
}
export function ReceiptFields({
  value,
  onChange,
  warehouses,
  canValue,
}: Readonly<{
  value: ReceiptDraft;
  onChange: (draft: ReceiptDraft) => void;
  warehouses: readonly WarehouseSummary[];
  canValue: boolean;
}>) {
  const field = (name: keyof ReceiptDraft, next: string) =>
    onChange({ ...value, [name]: next });
  return (
    <div className="form-grid">
      <FormField label="Bodega">
        <select
          required
          value={value.warehouseId}
          onChange={(event) => field('warehouseId', event.target.value)}
        >
          <option value="">Selecciona una bodega</option>
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        label="Cantidad que ingresa"
        hint="Admite hasta cuatro decimales."
      >
        <input
          required
          type="number"
          min="0.0001"
          step="0.0001"
          inputMode="decimal"
          value={value.quantity}
          onChange={(event) => field('quantity', event.target.value)}
        />
      </FormField>
      <FormField label="Motivo o referencia">
        <input
          required
          maxLength={500}
          value={value.reason}
          onChange={(event) => field('reason', event.target.value)}
          placeholder="Compra, reposición o referencia del documento"
        />
      </FormField>
      {canValue ? (
        <>
          <FormField
            label="Costo unitario (opcional)"
            hint="Vacío conserva el costo vigente; sin costo anterior quedará pendiente."
          >
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={value.unitCost}
              onChange={(event) => field('unitCost', event.target.value)}
            />
          </FormField>
          <FormField
            label="Precio de venta (opcional)"
            hint="Vacío conserva el precio vigente."
          >
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={value.unitPrice}
              onChange={(event) => field('unitPrice', event.target.value)}
            />
          </FormField>
        </>
      ) : (
        <p>
          Registra las cantidades. Los valores que falten quedarán pendientes
          para Finanzas.
        </p>
      )}
    </div>
  );
}
