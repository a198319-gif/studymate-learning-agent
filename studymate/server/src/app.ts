import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';

import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestId } from './middleware/request-id.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { PrismaUserRepository } from './modules/auth/user.repository.js';
import { PrismaMaterialRepository } from './modules/materials/material.repository.js';
import { createMaterialRouter } from './modules/materials/material.routes.js';
import { MaterialService } from './modules/materials/material.service.js';
import { LocalEmbeddingProvider } from './modules/materials/local-embedding.js';
import { QdrantVectorStore } from './modules/materials/qdrant-vector-store.js';
import { PrismaChatRepository } from './modules/study/chat.repository.js';
import { ChatService } from './modules/study/chat.service.js';
import { DeepSeekResponsesProvider } from './modules/study/deepseek-responses-provider.js';
import { GroundedStudyAgent, type ResponsesProvider } from './modules/study/grounded-study-agent.js';
import { PrismaGenerationRepository } from './modules/study/generation.repository.js';
import { GenerationService } from './modules/study/generation.service.js';
import { createStudyRouter } from './modules/study/study.routes.js';
import { VectorRetrievalService } from './modules/study/vector-retrieval.service.js';
import { PrismaQuizRepository } from './modules/study/quiz.repository.js';
import { createQuizRouter } from './modules/study/quiz.routes.js';
import { QuizService } from './modules/study/quiz.service.js';
import { AppError } from './shared/app-error.js';
import { createDashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { PrismaDashboardRepository } from './modules/dashboard/dashboard.repository.js';
import { DashboardService } from './modules/dashboard/dashboard.service.js';

export type AppOptions = {
  authService?: AuthService;
  materialService?: MaterialService;
  chatService?: ChatService;
  generationService?: GenerationService;
  quizService?: QuizService;
  dashboardService?: DashboardService;
  staticDirectory?: string;
};

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  const authService =
    options.authService ?? new AuthService(new PrismaUserRepository(), env.JWT_SECRET);
  const embeddings = new LocalEmbeddingProvider();
  const vectors = new QdrantVectorStore(env.QDRANT_URL, env.QDRANT_COLLECTION, embeddings.dimensions);
  const materialService =
    options.materialService ??
    new MaterialService(new PrismaMaterialRepository(), path.resolve(env.STORAGE_DIR), vectors);
  const provider: ResponsesProvider = env.DEEPSEEK_API_KEY
    ? new DeepSeekResponsesProvider({ apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL, model: env.DEEPSEEK_MODEL })
    : { create: () => Promise.reject(new AppError(503, 'AI_PROVIDER_NOT_CONFIGURED', 'Add DEEPSEEK_API_KEY to use AI Study.')) };
  const chatService = options.chatService ?? new ChatService(
    new PrismaChatRepository(),
    new GroundedStudyAgent(provider, new VectorRetrievalService(embeddings, vectors)),
  );
  const generationService = options.generationService ?? new GenerationService(
    new PrismaGenerationRepository(),
    new GroundedStudyAgent(provider, new VectorRetrievalService(embeddings, vectors)),
  );
  const quizService = options.quizService ?? new QuizService(
    new PrismaQuizRepository(),
    new GroundedStudyAgent(provider, new VectorRetrievalService(embeddings, vectors)),
  );
  const dashboardService = options.dashboardService ?? new DashboardService(new PrismaDashboardRepository());

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin: env.CLIENT_URL,
    }),
  );
  app.use(requestId);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      requestId: response.locals.requestId as string,
    });
  });
  app.use('/api/auth', createAuthRouter(authService));
  app.use('/api/materials', createMaterialRouter(materialService));
  app.use('/api/study', createStudyRouter(chatService, generationService));
  app.use('/api/quizzes', createQuizRouter(quizService));
  app.use('/api/dashboard', createDashboardRouter(dashboardService));

  if (options.staticDirectory) {
    const indexPath = path.join(options.staticDirectory, 'index.html');
    app.use(express.static(options.staticDirectory));
    app.use((request, response, next) => {
      if (request.method !== 'GET' || request.path.startsWith('/api/')) {
        next();
        return;
      }
      response.sendFile(indexPath, (error) => {
        if (error) next(error);
      });
    });
  }

  app.use((_request, _response, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Route not found.'));
  });

  app.use(errorHandler);

  return app;
}
