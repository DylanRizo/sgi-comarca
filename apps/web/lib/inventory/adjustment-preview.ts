const decimalPattern = /^([+-]?)(\d{1,14})(?:\.(\d{1,4}))?$/u;
const scale = 4;
const maximumScaledDecimal = 999_999_999_999_999_999n;

function scaled(value: string): bigint | null {
  const match = decimalPattern.exec(value);
  if (!match) return null;
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = match[2] ?? '0';
  const fraction = (match[3] ?? '').padEnd(scale, '0');
  return sign * BigInt(`${whole}${fraction}`);
}

function decimal(value: bigint): string {
  if (value === 0n) return '0';
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const padded = absolute.toString().padStart(scale + 1, '0');
  const whole = padded.slice(0, -scale);
  const fraction = padded.slice(-scale).replace(/0+$/u, '');
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}

export type AdjustmentPreview =
  | { kind: 'empty' | 'invalid' | 'negative' | 'zero' }
  | {
      balanceAfter: string;
      direction: 'ENTRY' | 'EXIT';
      kind: 'valid';
      quantityDelta: string;
    };

export function adjustmentPreview(
  balanceBefore: string,
  quantityDelta: string,
): AdjustmentPreview {
  if (!quantityDelta) return { kind: 'empty' };
  const before = scaled(balanceBefore);
  const delta = scaled(quantityDelta);
  if (before === null || delta === null) return { kind: 'invalid' };
  if (delta === 0n) return { kind: 'zero' };
  const after = before + delta;
  if (after < 0n) return { kind: 'negative' };
  if (after > maximumScaledDecimal) return { kind: 'invalid' };
  return {
    balanceAfter: decimal(after),
    direction: delta > 0n ? 'ENTRY' : 'EXIT',
    kind: 'valid',
    quantityDelta: decimal(delta),
  };
}
