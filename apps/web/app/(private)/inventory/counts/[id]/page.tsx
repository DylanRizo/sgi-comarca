import { InventoryCountDetailView } from '@/components/inventory/inventory-count-detail-view';
export default async function InventoryCountPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  return <InventoryCountDetailView id={(await params).id} />;
}
