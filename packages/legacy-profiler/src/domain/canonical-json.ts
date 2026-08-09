import { createHash } from 'node:crypto';

function normalize(value: unknown, path: string): unknown {
  if (value === undefined) {
    throw new TypeError(`Undefined is not canonical JSON at ${path}`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError(`Non-finite number is not canonical JSON at ${path}`);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalize(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right, 'en'),
    );
    return Object.fromEntries(
      entries.map(([key, child]) => [key, normalize(child, `${path}.${key}`)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(normalize(value, '$'), null, 2)}\n`;
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function canonicalFingerprint(value: unknown): string {
  return sha256Text(canonicalJson(value));
}
