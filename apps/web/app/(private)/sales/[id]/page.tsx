import { SaleDetailView } from '@/components/sales/sale-detail-view';

export default async function SaleDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <SaleDetailView saleId={id} />;
}
