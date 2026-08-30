import path from 'node:path';

import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { DashboardService } from '../modules/dashboard/dashboard.service.js';
import { LocalEmbeddingProvider } from '../modules/materials/local-embedding.js';
import { MaterialProcessor } from '../modules/materials/material-processor.js';
import { MaterialService } from '../modules/materials/material.service.js';
import { ChatService } from '../modules/study/chat.service.js';
import { DeepSeekResponsesProvider } from '../modules/study/deepseek-responses-provider.js';
import { GenerationService } from '../modules/study/generation.service.js';
import { GroundedStudyAgent, type ResponsesProvider } from '../modules/study/grounded-study-agent.js';
import { QuizService } from '../modules/study/quiz.service.js';
import { VectorRetrievalService } from '../modules/study/vector-retrieval.service.js';
import { AppError } from '../shared/app-error.js';
import { LocalUserRepository } from './local-auth.repository.js';
import { LocalChatRepository } from './local-chat.repository.js';
import { LocalDashboardRepository } from './local-dashboard.repository.js';
import { LocalGenerationRepository } from './local-generation.repository.js';
import { LocalMaterialRepository } from './local-material.repository.js';
import { LocalProcessingRepository } from './local-processing.repository.js';
import { LocalQuizRepository } from './local-quiz.repository.js';
import { LocalStore } from './local-store.js';
import { LocalVectorStore } from './local-vector-store.js';
import { LocalWorker } from './local-worker.js';

export type LocalRuntimeOptions = {
  dataDirectory: string;
  provider?: ResponsesProvider;
  staticDirectory?: string;
  workerIntervalMs?: number;
};

export async function createLocalRuntime(options: LocalRuntimeOptions) {
  const state = new LocalStore(path.join(options.dataDirectory, 'state.json'));
  const embeddings = new LocalEmbeddingProvider();
  const vectors = new LocalVectorStore(path.join(options.dataDirectory, 'vectors.json'), embeddings.dimensions);
  await vectors.ensureCollection();

  const processing = new LocalProcessingRepository(state);
  const worker = new LocalWorker(processing, new MaterialProcessor(processing, embeddings, vectors), state);
  const provider = options.provider ?? (env.DEEPSEEK_API_KEY
    ? new DeepSeekResponsesProvider({
      apiKey: env.DEEPSEEK_API_KEY,
      baseUrl: env.DEEPSEEK_BASE_URL,
      model: env.DEEPSEEK_MODEL,
    })
    : {
      create: () => Promise.reject(new AppError(503, 'AI_PROVIDER_NOT_CONFIGURED', 'Add DEEPSEEK_API_KEY to use AI Study.')),
    });
  const studyAgent = new GroundedStudyAgent(provider, new VectorRetrievalService(embeddings, vectors));

  const app = createApp({
    authService: new AuthService(new LocalUserRepository(state), env.JWT_SECRET),
    materialService: new MaterialService(
      new LocalMaterialRepository(state),
      path.join(options.dataDirectory, 'uploads'),
      vectors,
    ),
    chatService: new ChatService(new LocalChatRepository(state), studyAgent),
    generationService: new GenerationService(new LocalGenerationRepository(state), studyAgent),
    quizService: new QuizService(new LocalQuizRepository(state), studyAgent),
    dashboardService: new DashboardService(new LocalDashboardRepository(state)),
    ...(options.staticDirectory ? { staticDirectory: options.staticDirectory } : {}),
  });

  worker.start(options.workerIntervalMs ?? 250);
  let closed = false;
  return {
    app,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await worker.stop();
      await vectors.flush();
      await state.flush();
    },
  };
}
