import { z } from 'zod';

export const LOCAL_STATE_VERSION = 1;

const isoDate = z.iso.datetime();

const userSchema = z.object({
  id: z.string(), name: z.string(), email: z.string(), passwordHash: z.string(),
  createdAt: isoDate, updatedAt: isoDate,
});

const materialSchema = z.object({
  id: z.string(), userId: z.string(), originalName: z.string(), storedName: z.string(),
  storagePath: z.string(), mimeType: z.string(), extension: z.string(), size: z.number().int(),
  checksum: z.string(), status: z.enum(['UPLOADING', 'PROCESSING', 'READY', 'FAILED']),
  chunkCount: z.number().int(), processingError: z.string().nullable(), createdAt: isoDate, updatedAt: isoDate,
});

const processingJobSchema = z.object({
  id: z.string(), materialId: z.string(), userId: z.string(),
  stage: z.enum(['QUEUED', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'COMPLETE', 'FAILED']),
  attempts: z.number().int(), maxAttempts: z.number().int(), lockedAt: isoDate.nullable(),
  lockedBy: z.string().nullable(), errorCode: z.string().nullable(), createdAt: isoDate, updatedAt: isoDate,
});

const conversationSchema = z.object({
  id: z.string(), userId: z.string(), title: z.string(), createdAt: isoDate, updatedAt: isoDate,
});

const messageSchema = z.object({
  id: z.string(), conversationId: z.string(), role: z.enum(['USER', 'ASSISTANT']), content: z.string(),
  sources: z.array(z.string()), groundingStatus: z.enum(['GROUNDED', 'INSUFFICIENT', 'NOT_APPLICABLE']),
  createdAt: isoDate,
});

const artifactSchema = z.object({
  id: z.string(), userId: z.string(), type: z.enum(['SUMMARY', 'KEY_POINTS', 'QUIZ', 'EXAM_REVIEW']),
  title: z.string(), materialIds: z.array(z.string()), text: z.string(), sources: z.array(z.string()),
  groundingStatus: z.enum(['GROUNDED', 'INSUFFICIENT']), createdAt: isoDate, updatedAt: isoDate,
});

const quizSchema = z.object({
  id: z.string(), userId: z.string(), title: z.string(), difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  questionCount: z.number().int(), score: z.number().int().nullable(), materialIds: z.array(z.string()),
  createdAt: isoDate, updatedAt: isoDate,
});

const quizQuestionSchema = z.object({
  id: z.string(), quizId: z.string(), question: z.string(),
  type: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER']), options: z.array(z.string()).nullable(),
  correctAnswer: z.string(), userAnswer: z.string().nullable(), explanation: z.string(), sourceReference: z.string(),
  createdAt: isoDate, updatedAt: isoDate,
});

export const localStateSchema = z.object({
  version: z.literal(LOCAL_STATE_VERSION),
  users: z.array(userSchema),
  materials: z.array(materialSchema),
  processingJobs: z.array(processingJobSchema),
  conversations: z.array(conversationSchema),
  messages: z.array(messageSchema),
  artifacts: z.array(artifactSchema),
  quizzes: z.array(quizSchema),
  quizQuestions: z.array(quizQuestionSchema),
});

export type LocalState = z.infer<typeof localStateSchema>;
export type LocalUser = LocalState['users'][number];
export type LocalMaterial = LocalState['materials'][number];
export type LocalProcessingJob = LocalState['processingJobs'][number];
export type LocalConversation = LocalState['conversations'][number];
export type LocalMessage = LocalState['messages'][number];
export type LocalArtifact = LocalState['artifacts'][number];
export type LocalQuiz = LocalState['quizzes'][number];
export type LocalQuizQuestion = LocalState['quizQuestions'][number];

export function emptyLocalState(): LocalState {
  return {
    version: LOCAL_STATE_VERSION,
    users: [],
    materials: [],
    processingJobs: [],
    conversations: [],
    messages: [],
    artifacts: [],
    quizzes: [],
    quizQuestions: [],
  };
}
