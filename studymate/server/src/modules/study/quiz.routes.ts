import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../../middleware/authenticate.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { AppError } from '../../shared/app-error.js';
import { asyncHandler } from '../../shared/async-handler.js';
import type { QuizRecord, QuizService } from './quiz.service.js';

const generateSchema = z.object({
  materialIds: z.array(z.string().min(1)).min(1).max(50),
  language: z.enum(['en', 'zh']).default('zh'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  questionCount: z.number().int().min(2).max(20).default(8),
  questionTypes: z.array(z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'])).min(1).max(3)
    .default(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER']),
});

const submissionSchema = z.object({
  answers: z.array(z.object({ questionId: z.string().min(1), answer: z.string().max(2_000) })).min(1).max(20),
});

function routeId(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function publicQuiz(quiz: QuizRecord) {
  const submitted = quiz.score !== null;
  return {
    id: quiz.id,
    title: quiz.title,
    difficulty: quiz.difficulty,
    questionCount: quiz.questionCount,
    score: quiz.score,
    materialIds: quiz.materialIds,
    createdAt: quiz.createdAt,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      question: question.question,
      type: question.type,
      options: question.options,
      userAnswer: question.userAnswer,
      sourceReference: question.sourceReference,
      ...(submitted ? { correctAnswer: question.correctAnswer, explanation: question.explanation } : {}),
    })),
  };
}

export function createQuizRouter(service: QuizService): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/', asyncHandler(async (_request, response) => {
    const session = response.locals.session as { sub: string };
    response.json({ quizzes: (await service.list(session.sub)).map(publicQuiz) });
  }));
  router.post('/', requireCsrf, asyncHandler(async (request, response) => {
    const parsed = generateSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Check the quiz settings and selected materials.');
    const session = response.locals.session as { sub: string };
    const quiz = await service.generate({ userId: session.sub, ...parsed.data });
    response.status(201).json({ quiz: publicQuiz(quiz) });
  }));
  router.get('/:id', asyncHandler(async (request, response) => {
    const session = response.locals.session as { sub: string };
    response.json({ quiz: publicQuiz(await service.get(session.sub, routeId(request.params.id))) });
  }));
  router.post('/:id/submit', requireCsrf, asyncHandler(async (request, response) => {
    const parsed = submissionSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Check the submitted quiz answers.');
    const session = response.locals.session as { sub: string };
    const quiz = await service.submit(session.sub, routeId(request.params.id), parsed.data.answers);
    response.json({ quiz: publicQuiz(quiz) });
  }));
  return router;
}
