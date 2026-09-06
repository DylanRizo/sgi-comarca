import { ReceiptHistory } from '@/components/inventory/receipt-history';
export default async function ReceiptPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) { return <ReceiptHistory receiptId={(await params).id} />; }
