const decimalPattern = /^([+-]?)(\d{1,14})(?:\.(\d{1,4}))?$/u;
const decimalScale = 4;
export const maximumScaledInventoryQuantity = 999_999_999_999_999_999n;

export function inventoryScaledInteger(value: string): bigint | null {
  const match = decimalPattern.exec(value);
  if (!match) return null;
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = match[2] ?? '0';
  const fraction = (match[3] ?? '').padEnd(decimalScale, '0');
  return sign * BigInt(`${whole}${fraction}`);
}

export function inventoryDecimalString(value: bigint): string {
  if (value === 0n) return '0';
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const padded = absolute.toString().padStart(decimalScale + 1, '0');
  const whole = padded.slice(0, -decimalScale);
  const fraction = padded.slice(-decimalScale).replace(/0+$/u, '');
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}
