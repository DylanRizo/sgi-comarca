export function sumQuantity(before: string, added: string): string | null {
  const parse = (value: string) => {
    if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/u.test(value)) return null;
    const [integer, fraction = ''] = value.split('.');
    return BigInt(integer!) * 10000n + BigInt(fraction.padEnd(4, '0'));
  };
  const left = parse(before),
    right = parse(added);
  if (left === null || right === null || right <= 0n) return null;
  const total = left + right;
  if (total > 999999999999999999n) return null;
  const fraction = (total % 10000n)
    .toString()
    .padStart(4, '0')
    .replace(/0+$/u, '');
  return `${total / 10000n}${fraction ? '.' + fraction : ''}`;
}
