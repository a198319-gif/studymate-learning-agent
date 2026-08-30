import { randomUUID } from 'node:crypto';

import type { GeneratedArtifact, GenerationRepository } from '../modules/study/generation.service.js';
import type { LocalArtifact } from './local-state.js';
import type { LocalStore } from './local-store.js';

function toArtifact(artifact: LocalArtifact): GeneratedArtifact {
  return { ...artifact, materialIds: [...artifact.materialIds], sources: [...artifact.sources], createdAt: new Date(artifact.createdAt) };
}

export class LocalGenerationRepository implements GenerationRepository {
  constructor(private readonly store: LocalStore) {}

  async readyMaterialIds(userId: string, materialIds: string[]): Promise<string[]> {
    const state = await this.store.read();
    const ready = new Set(state.materials.filter((material) => material.userId === userId && material.status === 'READY').map((material) => material.id));
    return materialIds.filter((id) => ready.has(id));
  }

  save(input: Omit<GeneratedArtifact, 'id' | 'createdAt'>): Promise<GeneratedArtifact> {
    return this.store.update((state) => {
      const now = new Date().toISOString();
      const artifact: LocalArtifact = { id: randomUUID(), ...input, materialIds: [...input.materialIds], sources: [...input.sources], createdAt: now, updatedAt: now };
      state.artifacts.push(artifact);
      return toArtifact(artifact);
    });
  }

  async list(userId: string): Promise<GeneratedArtifact[]> {
    return (await this.store.read()).artifacts
      .filter((artifact) => artifact.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 100)
      .map(toArtifact);
  }

  async get(id: string, userId: string): Promise<GeneratedArtifact | null> {
    const artifact = (await this.store.read()).artifacts.find((candidate) => candidate.id === id && candidate.userId === userId);
    return artifact ? toArtifact(artifact) : null;
  }
}
