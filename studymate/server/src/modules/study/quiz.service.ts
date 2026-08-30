import { z } from 'zod';

import { AppError } from '../../shared/app-error.js';
import type { StudyAgent } from './chat.service.js';

export type QuizDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type QuizQuestionTypeValue = 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER';

export type QuizQuestionDraft = {
  question: string;
  type: QuizQuestionTypeValue;
  options: string[] | null;
  correctAnswer: string;
  explanation: string;
  sourceReference: string;
};

export type QuizQuestionRecord = QuizQuestionDraft & { id: string; userAnswer: string | null };

export type QuizRecord = {
  id: string;
  userId: string;
  title: string;
  difficulty: QuizDifficulty;
  questionCount: number;
  score: number | null;
  materialIds: string[];
  createdAt: Date;
  questions: QuizQuestionRecord[];
};

export interface QuizRepository {
  readyMaterialIds(userId: string, materialIds: string[]): Promise<string[]>;
  save(input: { userId: string; title: string; difficulty: QuizDifficulty; materialIds: string[]; questions: QuizQuestionDraft[] }): Promise<QuizRecord>;
  get(id: string, userId: string): Promise<QuizRecord | null>;
  saveSubmission(quizId: string, userId: string, score: number, answers: Array<{ questionId: string; answer: string }>): Promise<QuizRecord>;
  list(userId: string): Promise<QuizRecord[]>;
}

const generatedQuizSchema = z.object({
  title: z.string().trim().min(1).max(120),
  questions: z.array(z.object({
    question: z.string().trim().min(1).max(2_000),
    type: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER']),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(6).nullable().default(null),
    correctAnswer: z.string().trim().min(1).max(1_000),
    explanation: z.string().trim().min(1).max(2_000),
    sourceReference: z.string().trim().min(1).max(500),
  })).min(1).max(20),
});

function parseQuiz(text: string) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    const parsed = generatedQuizSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function quizResponseFormat(questionCount: number, questionTypes: QuizQuestionTypeValue[]) {
  return {
    type: 'json_schema' as const,
    name: 'studymate_quiz',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'questions'],
      properties: {
        title: { type: 'string' },
        questions: {
          type: 'array',
          minItems: questionCount,
          maxItems: questionCount,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['question', 'type', 'options', 'correctAnswer', 'explanation', 'sourceReference'],
            properties: {
              question: { type: 'string' },
              type: { type: 'string', enum: questionTypes },
              options: {
                anyOf: [
                  { type: 'array', minItems: 2, maxItems: 6, items: { type: 'string' } },
                  { type: 'null' },
                ],
              },
              correctAnswer: { type: 'string' },
              explanation: { type: 'string' },
              sourceReference: { type: 'string' },
            },
          },
        },
      },
    },
  };
}

export class QuizService {
  constructor(
    private readonly repository: QuizRepository,
    private readonly agent: StudyAgent,
  ) {}

  async generate(input: { userId: string; materialIds: string[]; language: 'en' | 'zh'; difficulty: QuizDifficulty; questionCount: number; questionTypes?: QuizQuestionTypeValue[] }): Promise<QuizRecord> {
    const materialIds = await this.repository.readyMaterialIds(input.userId, [...new Set(input.materialIds)]);
    const questionTypes: QuizQuestionTypeValue[] = [
      ...new Set<QuizQuestionTypeValue>(input.questionTypes ?? ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER']),
    ];
    let invalidResponse = '';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const repair = attempt > 0
        ? `The previous output was invalid. Return corrected JSON only. Previous output: ${invalidResponse.slice(0, 8_000)}`
        : '';
      const answer = await this.agent.ask({
        userId: input.userId,
        materialIds,
        language: input.language,
        beginnerMode: false,
        retrievalMode: 'selected',
        responseFormat: quizResponseFormat(input.questionCount, questionTypes),
        question: [
          `Create exactly ${input.questionCount} ${input.difficulty.toLowerCase()} practice questions using only the selected materials.`,
          `Use only these question types: ${questionTypes.join(', ')}.`,
          'Return JSON only: {"title":"...","questions":[{"question":"...","type":"MULTIPLE_CHOICE|TRUE_FALSE|SHORT_ANSWER","options":["..."] or null,"correctAnswer":"...","explanation":"...","sourceReference":"exact filename"}]}.',
          'For TRUE_FALSE use options ["True","False"]. Every sourceReference must be an exact source filename.',
          repair,
        ].filter(Boolean).join(' '),
      });
      if (answer.groundingStatus === 'INSUFFICIENT') {
        throw new AppError(422, 'QUIZ_EVIDENCE_INSUFFICIENT', 'The selected materials do not contain enough information for a quiz.');
      }
      const parsed = parseQuiz(answer.answer);
      const allowedSources = new Set(answer.sources);
      const valid = parsed && parsed.questions.length === input.questionCount && parsed.questions.every((question) => questionTypes.includes(question.type) && allowedSources.has(question.sourceReference));
      if (valid) {
        return this.repository.save({
          userId: input.userId,
          title: parsed.title,
          difficulty: input.difficulty,
          materialIds,
          questions: parsed.questions,
        });
      }
      invalidResponse = answer.answer;
    }
    throw new AppError(502, 'QUIZ_GENERATION_INVALID', 'The quiz could not be generated in a valid format.');
  }

  async get(userId: string, quizId: string): Promise<QuizRecord> {
    const quiz = await this.repository.get(quizId, userId);
    if (!quiz) throw new AppError(404, 'QUIZ_NOT_FOUND', 'Quiz not found.');
    return quiz;
  }

  async submit(userId: string, quizId: string, answers: Array<{ questionId: string; answer: string }>): Promise<QuizRecord> {
    const quiz = await this.get(userId, quizId);
    if (quiz.score !== null) throw new AppError(409, 'QUIZ_ALREADY_SUBMITTED', 'This quiz has already been submitted.');
    const submitted = new Map(answers.map((answer) => [answer.questionId, answer.answer]));
    const correct = quiz.questions.filter((question) => normalized(submitted.get(question.id) ?? '') === normalized(question.correctAnswer)).length;
    const score = Math.round((correct / quiz.questions.length) * 100);
    const safeAnswers = quiz.questions.map((question) => ({ questionId: question.id, answer: submitted.get(question.id) ?? '' }));
    return this.repository.saveSubmission(quizId, userId, score, safeAnswers);
  }

  list(userId: string): Promise<QuizRecord[]> {
    return this.repository.list(userId);
  }
}
