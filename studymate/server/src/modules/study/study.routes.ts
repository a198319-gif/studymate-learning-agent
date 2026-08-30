import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../../middleware/authenticate.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { AppError } from '../../shared/app-error.js';
import { asyncHandler } from '../../shared/async-handler.js';
import type { ChatService } from './chat.service.js';
import type { GenerationService } from './generation.service.js';

const chatSchema = z.object({
  question: z.string().trim().min(1).max(10_000),
  materialIds: z.array(z.string().min(1)).min(1).max(50),
  conversationId: z.string().min(1).optional(),
  language: z.enum(['en', 'zh']).default('zh'),
  beginnerMode: z.boolean().default(false),
  retrievalMode: z.enum(['semantic', 'selected']).default('semantic'),
});

const generationSchema = z.object({
  type: z.enum(['SUMMARY', 'KEY_POINTS', 'EXAM_REVIEW']),
  materialIds: z.array(z.string().min(1)).min(1).max(50),
  language: z.enum(['en', 'zh']).default('zh'),
});

export function createStudyRouter(service: ChatService, generation: GenerationService): Router {
  const router = Router();
  router.use(authenticate);
  router.post('/chat', requireCsrf, asyncHandler(async (request, response) => {
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Check the study question and selected materials.');
    const session = response.locals.session as { sub: string };
    const result = await service.send({ userId: session.sub, ...parsed.data });
    response.status(201).json(result);
  }));
  router.post('/generate', requireCsrf, asyncHandler(async (request, response) => {
    const parsed = generationSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Check the generation type and selected materials.');
    const session = response.locals.session as { sub: string };
    const artifact = await generation.generate({ userId: session.sub, ...parsed.data });
    response.status(201).json({ artifact });
  }));
  router.get('/history', asyncHandler(async (_request, response) => {
    const session = response.locals.session as { sub: string };
    response.json({ artifacts: await generation.list(session.sub) });
  }));
  router.get('/artifacts/:id', asyncHandler(async (request, response) => {
    const session = response.locals.session as { sub: string };
    const id = typeof request.params.id === 'string' ? request.params.id : '';
    response.json({ artifact: await generation.get(session.sub, id) });
  }));
  router.get('/conversations', asyncHandler(async (request, response) => {
    const session = response.locals.session as { sub: string };
    const cursor = typeof request.query.cursor === 'string' ? request.query.cursor : undefined;
    response.json(await service.listConversations(session.sub, cursor));
  }));
  router.get('/conversations/:id', asyncHandler(async (request, response) => {
    const session = response.locals.session as { sub: string };
    const id = typeof request.params.id === 'string' ? request.params.id : '';
    response.json({ conversation: await service.getConversation(session.sub, id) });
  }));
  return router;
}
