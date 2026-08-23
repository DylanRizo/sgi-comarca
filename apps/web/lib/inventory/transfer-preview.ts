const decimalPattern = /^(\d{1,14})(?:\.(\d{1,4}))?$/u;
const scale = 4;

function scaled(value: string): bigint | null {
  const match = decimalPattern.exec(value);
  if (!match) return null;
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(scale, '0');
  return BigInt(`${whole}${fraction}`);
}

function decimal(value: bigint): string {
  if (value === 0n) return '0';
  const padded = value.toString().padStart(scale + 1, '0');
  const whole = padded.slice(0, -scale);
  const fraction = padded.slice(-scale).replace(/0+$/u, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}

export type TransferPreview =
  | { kind: 'empty' | 'insufficient' | 'invalid' | 'same-warehouse' | 'zero' }
  | {
      destinationAfter: string;
      destinationBefore: string;
      kind: 'valid';
      originAfter: string;
      originBefore: string;
      quantity: string;
      stockTotalAfter: string;
      stockTotalBefore: string;
    };

export function transferPreview(
  originQuantity: string | undefined,
  destinationQuantity: string | undefined,
  quantity: string,
  sameWarehouse: boolean,
  stockTotal: string | undefined,
): TransferPreview {
  if (!quantity || originQuantity === undefined || stockTotal === undefined) {
    return { kind: 'empty' };
  }
  if (sameWarehouse) return { kind: 'same-warehouse' };
  const origin = scaled(originQuantity);
  const destination = scaled(destinationQuantity ?? '0');
  const requested = scaled(quantity);
  const total = scaled(stockTotal);
  if (
    origin === null ||
    destination === null ||
    requested === null ||
    total === null
  ) {
    return { kind: 'invalid' };
  }
  if (requested === 0n) return { kind: 'zero' };
  if (requested > origin) return { kind: 'insufficient' };
  return {
    destinationAfter: decimal(destination + requested),
    destinationBefore: decimal(destination),
    kind: 'valid',
    originAfter: decimal(origin - requested),
    originBefore: decimal(origin),
    quantity: decimal(requested),
    stockTotalAfter: decimal(total),
    stockTotalBefore: decimal(total),
  };
}
