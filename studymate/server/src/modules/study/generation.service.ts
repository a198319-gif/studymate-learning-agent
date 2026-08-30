import type { StudyAgent } from './chat.service.js';
import { AppError } from '../../shared/app-error.js';

export type GenerationType = 'SUMMARY' | 'KEY_POINTS' | 'QUIZ' | 'EXAM_REVIEW';

export type GeneratedArtifact = {
  id: string;
  userId: string;
  type: GenerationType;
  title: string;
  materialIds: string[];
  text: string;
  sources: string[];
  groundingStatus: 'GROUNDED' | 'INSUFFICIENT';
  createdAt: Date;
};

export interface GenerationRepository {
  readyMaterialIds(userId: string, materialIds: string[]): Promise<string[]>;
  save(artifact: Omit<GeneratedArtifact, 'id' | 'createdAt'>): Promise<GeneratedArtifact>;
  list(userId: string): Promise<GeneratedArtifact[]>;
  get(id: string, userId: string): Promise<GeneratedArtifact | null>;
}

const prompts: Record<GenerationType, { title: string; instruction: string }> = {
  SUMMARY: { title: 'Smart summary', instruction: 'Create a concise, well-structured summary of the selected materials. Use headings and explain the main relationships.' },
  KEY_POINTS: { title: 'Key points', instruction: 'Extract the most important key points from the selected materials. Prioritize facts worth remembering and use a numbered list.' },
  QUIZ: { title: 'Practice quiz', instruction: 'Create a practice quiz with 8 varied questions from the selected materials. Put the answer and a short source-grounded explanation immediately after each question so the learner can self-check.' },
  EXAM_REVIEW: { title: 'Exam review guide', instruction: 'Create an exam review guide from the selected materials. Include likely high-value concepts, common confusions, and a short revision checklist.' },
};

export class GenerationService {
  constructor(
    private readonly repository: GenerationRepository,
    private readonly agent: StudyAgent,
  ) {}

  async generate(input: { userId: string; type: GenerationType; materialIds: string[]; language: 'en' | 'zh' }): Promise<GeneratedArtifact> {
    const materialIds = await this.repository.readyMaterialIds(input.userId, [...new Set(input.materialIds)]);
    const prompt = prompts[input.type];
    const answer = await this.agent.ask({
      userId: input.userId,
      question: prompt.instruction,
      materialIds,
      language: input.language,
      beginnerMode: false,
      retrievalMode: 'selected',
    });
    return this.repository.save({
      userId: input.userId,
      type: input.type,
      title: prompt.title,
      materialIds,
      text: answer.answer,
      sources: answer.sources,
      groundingStatus: answer.groundingStatus,
    });
  }

  list(userId: string): Promise<GeneratedArtifact[]> {
    return this.repository.list(userId);
  }

  async get(userId: string, artifactId: string): Promise<GeneratedArtifact> {
    const artifact = await this.repository.get(artifactId, userId);
    if (!artifact) throw new AppError(404, 'ARTIFACT_NOT_FOUND', 'Generated artifact not found.');
    return artifact;
  }
}
