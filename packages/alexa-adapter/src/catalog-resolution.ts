interface CatalogCandidate {
  active: boolean;
  code: string;
  id: string;
  name: string;
}

export type CatalogResolution<T extends CatalogCandidate> =
  | { kind: 'found'; match: 'exact' | 'inferred'; value: T }
  | { kind: 'ambiguous'; values: readonly T[] }
  | { kind: 'not_found' };

const PRODUCT_FILLER_WORDS = new Set([
  'color',
  'de',
  'del',
  'el',
  'la',
  'las',
  'los',
  'producto',
  'talla',
  'un',
  'una',
]);

const PRODUCT_WORD_ALIASES = new Map([
  ['amarilla', 'amarillo'],
  ['blanca', 'blanco'],
  ['ele', 'l'],
  ['eme', 'm'],
  ['ese', 's'],
  ['grande', 'l'],
  ['mediana', 'm'],
  ['mediano', 'm'],
  ['negra', 'negro'],
  ['pequena', 's'],
  ['pequeno', 's'],
  ['roja', 'rojo'],
]);

export function normalizeSpokenValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-NI')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

export function productQueryTokens(value: string): readonly string[] {
  const spokenTokens = normalizeSpokenValue(value)
    .split(' ')
    .filter(Boolean)
    .filter((token) => !PRODUCT_FILLER_WORDS.has(token));
  const tokens: string[] = [];
  for (let index = 0; index < spokenTokens.length; index += 1) {
    const token = spokenTokens[index]!;
    const next = spokenTokens[index + 1];
    const afterNext = spokenTokens[index + 2];
    if (
      token === 'doble' &&
      next === 'equis' &&
      (afterNext === 'ele' || afterNext === 'l')
    ) {
      tokens.push('xxl');
      index += 2;
      continue;
    }
    if (token === 'equis' && (next === 'ele' || next === 'l')) {
      tokens.push('xl');
      index += 1;
      continue;
    }
    tokens.push(PRODUCT_WORD_ALIASES.get(token) ?? token);
  }
  return [...new Set(tokens)];
}

function minimumProductMatches(tokenCount: number): number {
  if (tokenCount <= 2) return tokenCount;
  return Math.max(2, Math.ceil(tokenCount * 0.7));
}

/**
 * Keeps only the strongest token matches before the final safe resolution.
 * Ties are deliberately preserved so the skill asks instead of guessing.
 */
export function rankProductCandidates<T extends CatalogCandidate>(
  spokenValue: string,
  candidates: readonly T[],
): readonly T[] {
  const active = candidates.filter((candidate) => candidate.active);
  const normalized = normalizeSpokenValue(spokenValue);
  const exact = active.filter(
    (candidate) =>
      normalizeSpokenValue(candidate.code) === normalized ||
      normalizeSpokenValue(candidate.name) === normalized,
  );
  if (exact.length > 0) return exact;

  const queryTokens = productQueryTokens(spokenValue);
  if (queryTokens.length === 0) return [];
  const requiredMatches = minimumProductMatches(queryTokens.length);
  const scored = active
    .map((candidate) => {
      const candidateTokens = new Set(productQueryTokens(candidate.name));
      const matches = queryTokens.filter((token) =>
        candidateTokens.has(token),
      ).length;
      return { candidate, matches };
    })
    .filter(({ matches }) => matches >= requiredMatches);
  const strongestMatch = Math.max(0, ...scored.map(({ matches }) => matches));
  return scored
    .filter(({ matches }) => matches === strongestMatch)
    .map(({ candidate }) => candidate);
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

  if (exact.length === 1) {
    return { kind: 'found', match: 'exact', value: exact[0]! };
  }
  if (exact.length > 1) return { kind: 'ambiguous', values: exact };
  if (active.length === 1) {
    return { kind: 'found', match: 'inferred', value: active[0]! };
  }
  if (active.length > 1) return { kind: 'ambiguous', values: active };
  return { kind: 'not_found' };
}
