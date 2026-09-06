import { ReceiptEditor } from '@/components/inventory/receipt-editor';
export default async function NewReceiptPage({ searchParams }: Readonly<{ searchParams: Promise<{ productId?: string; warehouseId?: string }> }>) {
  const { productId, warehouseId } = await searchParams;
  return <ReceiptEditor {...(productId ? { productId } : {})} {...(warehouseId ? { warehouseId } : {})} />;
}
