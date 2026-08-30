import { describe, expect, it } from 'vitest';

import { GenerationService, type GeneratedArtifact, type GenerationRepository } from '../src/modules/study/generation.service.js';
import type { StudyAnswer, StudyRequest } from '../src/modules/study/grounded-study-agent.js';
import type { StudyAgent } from '../src/modules/study/chat.service.js';

class FakeAgent implements StudyAgent {
  requests: StudyRequest[] = [];
  ask(request: StudyRequest): Promise<StudyAnswer> {
    this.requests.push(request);
    return Promise.resolve({ answer: '1. Retrieval practice\n2. Spaced practice', sources: ['notes.txt'], groundingStatus: 'GROUNDED' });
  }
}

class FakeRepository implements GenerationRepository {
  saved: GeneratedArtifact | null = null;
  readyMaterialIds(_userId: string, ids: string[]) { return Promise.resolve(ids.filter((id) => id === 'owned')); }
  save(artifact: Omit<GeneratedArtifact, 'id' | 'createdAt'>) {
    this.saved = { id: 'artifact-1', createdAt: new Date(), ...artifact };
    return Promise.resolve(this.saved);
  }
  list(userId: string) { void userId; return Promise.resolve(this.saved ? [this.saved] : []); }
  get(id: string, userId: string) {
    return Promise.resolve(this.saved?.id === id && this.saved.userId === userId ? this.saved : null);
  }
}

describe('GenerationService', () => {
  it('generates and persists content using only owned ready materials', async () => {
    const repository = new FakeRepository();
    const agent = new FakeAgent();
    const service = new GenerationService(repository, agent);

    const artifact = await service.generate({ userId: 'user-1', type: 'KEY_POINTS', materialIds: ['owned', 'foreign'], language: 'en' });

    expect(agent.requests[0]?.materialIds).toEqual(['owned']);
    expect(agent.requests[0]?.question).toContain('key points');
    expect(agent.requests[0]?.retrievalMode).toBe('selected');
    expect(artifact).toMatchObject({ id: 'artifact-1', type: 'KEY_POINTS', sources: ['notes.txt'] });
  });
});
