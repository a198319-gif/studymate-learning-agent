import type { EmbeddingProvider } from './material-processor.js';

function hashToken(token: string): number {
  let hash = 2_166_136_261;
  for (const character of token) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function features(text: string): string[] {
  const words = text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.flatMap((word) => {
    const characters = [...word];
    if (characters.length < 3) return [word];
    return [word, ...characters.slice(0, -1).map((character, index) => `${character}${characters[index + 1] ?? ''}`)];
  });
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 384;

  private embed(text: string): number[] {
    const vector = Array.from<number>({ length: this.dimensions }).fill(0);
    for (const token of features(text)) {
      const hash = hashToken(token);
      const index = hash % this.dimensions;
      vector[index] = (vector[index] ?? 0) + ((hash & 1) === 0 ? 1 : -1);
    }
    const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
    return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
  }

  embedPassages(passages: string[]): Promise<number[][]> {
    return Promise.resolve(passages.map((passage) => this.embed(`passage: ${passage}`)));
  }

  embedQuery(query: string): Promise<number[]> {
    return Promise.resolve(this.embed(`query: ${query}`));
  }
}
