import { ProductDetailView } from '@/components/inventory/product-detail-view';

export default async function ProductDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <ProductDetailView productId={id} />;
}
