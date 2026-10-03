import { describe, expect, it } from 'vitest';

import {
  productQueryTokens,
  rankProductCandidates,
  resolveCatalogCandidate,
} from '../src/catalog-resolution.js';

const products = [
  {
    active: true,
    code: 'CAM-COMP-BL-M',
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Camisa de compresión manga larga blanca M',
  },
  {
    active: true,
    code: 'CAM-COMP-BL-L',
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Camisa de compresión manga larga blanca L',
  },
  {
    active: true,
    code: 'CAM-COMP-NE-M',
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Camisa de compresión manga larga negra M',
  },
] as const;

describe('voice catalog resolution', () => {
  it('normalizes filler words, color gender and spoken sizes', () => {
    expect(
      productQueryTokens(
        'producto camisa de compresion color blanca talla mediana',
      ),
    ).toEqual(['camisa', 'compresion', 'blanco', 'm']);
    expect(productQueryTokens('camisa talla equis ele')).toEqual([
      'camisa',
      'xl',
    ]);
  });

  it('selects a unique strongest match despite word order and one bad word', () => {
    const ranked = rankProductCandidates(
      'manga camisa compresión larga blanca eme deportiva',
      products,
    );

    expect(ranked.map((product) => product.code)).toEqual(['CAM-COMP-BL-M']);
    expect(
      resolveCatalogCandidate('consulta aproximada', ranked),
    ).toMatchObject({ kind: 'found', match: 'inferred' });
  });

  it('preserves tied variants so the skill asks instead of guessing', () => {
    const ranked = rankProductCandidates(
      'camisa de compresión manga larga blanca',
      products,
    );

    expect(ranked.map((product) => product.code)).toEqual([
      'CAM-COMP-BL-M',
      'CAM-COMP-BL-L',
    ]);
  });

  it('rejects a weak partial overlap', () => {
    expect(rankProductCandidates('camisa casual azul', products)).toHaveLength(
      0,
    );
  });
});
