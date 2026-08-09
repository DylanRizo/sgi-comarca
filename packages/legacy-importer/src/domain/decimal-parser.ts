export interface ParsedDecimal {
  canonical: string;
  scale: number;
}

const DECIMAL_PATTERN = /^-?\d+(?:\.(\d+))?$/u;

export function parseUnambiguousDecimal(
  value: unknown,
  maximumScale: number,
): ParsedDecimal {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error('DECIMAL_TYPE_INVALID');
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('DECIMAL_NON_FINITE');
  }
  const text = typeof value === 'number' ? String(value) : value;
  if (text.trim() !== text || text.includes(',') || /[eE]/u.test(text)) {
    throw new Error('DECIMAL_AMBIGUOUS');
  }
  const match = DECIMAL_PATTERN.exec(text);
  if (match === null) throw new Error('DECIMAL_INVALID');
  const scale = match[1]?.length ?? 0;
  if (scale > maximumScale) throw new Error('DECIMAL_SCALE_EXCEEDED');
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [integer = '0', fraction] = unsigned.split('.');
  const normalizedInteger = integer.replace(/^0+(?=\d)/u, '') || '0';
  const canonical = `${negative && unsigned !== '0' ? '-' : ''}${normalizedInteger}${fraction === undefined ? '' : `.${fraction}`}`;
  return { canonical, scale };
}
