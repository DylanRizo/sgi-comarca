/** Do not guess how a combined free-text method was allocated. */
export function paymentBucket(
  method: string | null,
): 'cash' | 'digital' | 'unspecified' {
  const normalized = (method ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  if (normalized === 'efectivo' || normalized === 'cash') return 'cash';
  if (
    [
      'digital',
      'tarjeta',
      'transferencia',
      'transferencia bancaria',
      'tarjeta de credito',
      'tarjeta de debito',
    ].includes(normalized)
  )
    return 'digital';
  return 'unspecified';
}
