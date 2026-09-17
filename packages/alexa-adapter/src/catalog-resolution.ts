interface CatalogCandidate {
  active: boolean;
  code: string;
  id: string;
  name: string;
}

export type CatalogResolution<T extends CatalogCandidate> =
  | { kind: 'found'; value: T }
  | { kind: 'ambiguous'; values: readonly T[] }
  | { kind: 'not_found' };

export function normalizeSpokenValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-NI')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

export function resolveCatalogCandidate<T extends CatalogCandidate>(
  spokenValue: string,
  candidates: readonly T[],
): CatalogResolution<T> {
  const active = candidates.filter((candidate) => candidate.active);
  const normalized = normalizeSpokenValue(spokenValue);
  const exact = active.filter(
    (candidate) =>
      normalizeSpokenValue(candidate.code) === normalized ||
      normalizeSpokenValue(candidate.name) === normalized,
  );

  if (exact.length === 1) return { kind: 'found', value: exact[0]! };
  if (exact.length > 1) return { kind: 'ambiguous', values: exact };
  if (active.length === 1) return { kind: 'found', value: active[0]! };
  if (active.length > 1) return { kind: 'ambiguous', values: active };
  return { kind: 'not_found' };
}
