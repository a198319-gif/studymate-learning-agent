import { z } from 'zod';

import { prisma } from '../../config/prisma.js';
import { AppError } from '../../shared/app-error.js';
import { Prisma } from '@prisma/client';
import type { QuizRecord, QuizRepository } from './quiz.service.js';

const stringArraySchema = z.array(z.string());

type QuizWithQuestions = Prisma.QuizGetPayload<{ include: { questions: true } }>;

function toRecord(quiz: QuizWithQuestions): QuizRecord {
  const materialIds = stringArraySchema.safeParse(quiz.materialIds);
  return {
    id: quiz.id,
    userId: quiz.userId,
    title: quiz.title,
    difficulty: quiz.difficulty as QuizRecord['difficulty'],
    questionCount: quiz.questionCount,
    score: quiz.score,
    materialIds: materialIds.success ? materialIds.data : [],
    createdAt: quiz.createdAt,
    questions: quiz.questions.map((question) => {
      const options = stringArraySchema.safeParse(question.options);
      return {
        id: question.id,
        question: question.question,
        type: question.type,
        options: options.success ? options.data : null,
        correctAnswer: question.correctAnswer,
        userAnswer: question.userAnswer,
        explanation: question.explanation,
        sourceReference: question.sourceReference,
      };
    }),
  };
}

const quizInclude = { questions: { orderBy: { createdAt: 'asc' as const } } } satisfies Prisma.QuizInclude;

export class PrismaQuizRepository implements QuizRepository {
  async readyMaterialIds(userId: string, materialIds: string[]): Promise<string[]> {
    const rows = await prisma.material.findMany({ where: { userId, id: { in: materialIds }, status: 'READY' }, select: { id: true } });
    const owned = new Set(rows.map((row) => row.id));
    return materialIds.filter((id) => owned.has(id));
  }

  async save(input: Parameters<QuizRepository['save']>[0]): Promise<QuizRecord> {
    const quiz = await prisma.quiz.create({
      data: {
        userId: input.userId, title: input.title, difficulty: input.difficulty,
        questionCount: input.questions.length, materialIds: input.materialIds,
        questions: { create: input.questions.map((question) => ({ ...question, options: question.options ?? Prisma.JsonNull })) },
      },
      include: quizInclude,
    });
    return toRecord(quiz);
  }

  async get(id: string, userId: string): Promise<QuizRecord | null> {
    const quiz = await prisma.quiz.findFirst({ where: { id, userId }, include: quizInclude });
    return quiz ? toRecord(quiz) : null;
  }

  async saveSubmission(quizId: string, userId: string, score: number, answers: Array<{ questionId: string; answer: string }>): Promise<QuizRecord> {
    return prisma.$transaction(async (transaction) => {
      const quiz = await transaction.quiz.findFirst({ where: { id: quizId, userId }, select: { id: true } });
      if (!quiz) throw new AppError(404, 'QUIZ_NOT_FOUND', 'Quiz not found.');
      for (const answer of answers) {
        await transaction.quizQuestion.updateMany({ where: { id: answer.questionId, quizId }, data: { userAnswer: answer.answer } });
      }
      const updated = await transaction.quiz.update({ where: { id: quizId }, data: { score }, include: quizInclude });
      return toRecord(updated);
    });
  }

  async list(userId: string): Promise<QuizRecord[]> {
    const quizzes = await prisma.quiz.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100, include: quizInclude });
    return quizzes.map(toRecord);
  }
}
