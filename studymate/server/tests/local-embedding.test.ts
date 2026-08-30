import { describe, expect, it } from 'vitest';

import { LocalEmbeddingProvider } from '../src/modules/materials/local-embedding.js';

function cosine(left: number[], right: number[]): number {
  return left.reduce((total, value, index) => total + value * (right[index] ?? 0), 0);
}

describe('LocalEmbeddingProvider', () => {
  it('normalizes vectors and ranks overlapping study text above unrelated text', async () => {
    const provider = new LocalEmbeddingProvider();
    const query = await provider.embedQuery('working memory capacity');
    const [relevant, unrelated] = await provider.embedPassages([
      'Working memory has limited capacity and supports active processing.',
      'The French Revolution began during a fiscal crisis.',
    ]);

    expect(cosine(query, relevant ?? [])).toBeGreaterThan(0.45);
    expect(cosine(query, relevant ?? [])).toBeGreaterThan(cosine(query, unrelated ?? []));
    expect(Math.sqrt(query.reduce((total, value) => total + value * value, 0))).toBeCloseTo(1);
  });
});
