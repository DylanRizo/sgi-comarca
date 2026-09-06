import { ProductEditor } from '@/components/inventory/product-editor';
export default async function EditProductPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  return <ProductEditor productId={(await params).id} />;
}
