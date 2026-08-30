import { randomUUID } from 'node:crypto';

import type { QuizRecord, QuizRepository } from '../modules/study/quiz.service.js';
import { AppError } from '../shared/app-error.js';
import type { LocalQuiz, LocalQuizQuestion, LocalState } from './local-state.js';
import type { LocalStore } from './local-store.js';

function toRecord(quiz: LocalQuiz, state: LocalState): QuizRecord {
  return {
    id: quiz.id,
    userId: quiz.userId,
    title: quiz.title,
    difficulty: quiz.difficulty,
    questionCount: quiz.questionCount,
    score: quiz.score,
    materialIds: [...quiz.materialIds],
    createdAt: new Date(quiz.createdAt),
    questions: state.quizQuestions.filter((question) => question.quizId === quiz.id).map((question) => ({
      id: question.id,
      question: question.question,
      type: question.type,
      options: question.options ? [...question.options] : null,
      correctAnswer: question.correctAnswer,
      userAnswer: question.userAnswer,
      explanation: question.explanation,
      sourceReference: question.sourceReference,
    })),
  };
}

export class LocalQuizRepository implements QuizRepository {
  constructor(private readonly store: LocalStore) {}

  async readyMaterialIds(userId: string, materialIds: string[]): Promise<string[]> {
    const state = await this.store.read();
    const ready = new Set(state.materials.filter((material) => material.userId === userId && material.status === 'READY').map((material) => material.id));
    return materialIds.filter((id) => ready.has(id));
  }

  save(input: Parameters<QuizRepository['save']>[0]): Promise<QuizRecord> {
    return this.store.update((state) => {
      const now = new Date().toISOString();
      const quiz: LocalQuiz = {
        id: randomUUID(), userId: input.userId, title: input.title, difficulty: input.difficulty,
        questionCount: input.questions.length, score: null, materialIds: [...input.materialIds], createdAt: now, updatedAt: now,
      };
      const questions: LocalQuizQuestion[] = input.questions.map((question) => ({
        id: randomUUID(), quizId: quiz.id, ...question,
        options: question.options ? [...question.options] : null,
        userAnswer: null, createdAt: now, updatedAt: now,
      }));
      state.quizzes.push(quiz);
      state.quizQuestions.push(...questions);
      return toRecord(quiz, state);
    });
  }

  async get(id: string, userId: string): Promise<QuizRecord | null> {
    const state = await this.store.read();
    const quiz = state.quizzes.find((candidate) => candidate.id === id && candidate.userId === userId);
    return quiz ? toRecord(quiz, state) : null;
  }

  saveSubmission(quizId: string, userId: string, score: number, answers: Array<{ questionId: string; answer: string }>): Promise<QuizRecord> {
    return this.store.update((state) => {
      const quiz = state.quizzes.find((candidate) => candidate.id === quizId && candidate.userId === userId);
      if (!quiz) throw new AppError(404, 'QUIZ_NOT_FOUND', 'Quiz not found.');
      const submitted = new Map(answers.map((answer) => [answer.questionId, answer.answer]));
      for (const question of state.quizQuestions.filter((candidate) => candidate.quizId === quizId)) {
        question.userAnswer = submitted.get(question.id) ?? '';
        question.updatedAt = new Date().toISOString();
      }
      quiz.score = score;
      quiz.updatedAt = new Date().toISOString();
      return toRecord(quiz, state);
    });
  }

  async list(userId: string): Promise<QuizRecord[]> {
    const state = await this.store.read();
    return state.quizzes.filter((quiz) => quiz.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 100)
      .map((quiz) => toRecord(quiz, state));
  }
}
