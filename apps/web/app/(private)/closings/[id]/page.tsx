import { ClosingDetailView } from '@/components/finances/closing-detail-view';

export default async function ClosingDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <ClosingDetailView closingId={id} />;
}
