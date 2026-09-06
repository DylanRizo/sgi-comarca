import { SalesListView } from '@/components/sales/sales-list-view';

export default async function SalesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ create?: string }> }>) {
  return <SalesListView openCreate={(await searchParams).create === '1'} />;
}
