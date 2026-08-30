import { resolve } from 'node:path';

import { config } from 'dotenv';
import { z } from 'zod';

config({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')],
  quiet: true,
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().positive().max(65_535).default(5000),
  CLIENT_URL: z.url().default('http://localhost:5173'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(26_214_400),
  STORAGE_DIR: z.string().default('storage'),
  QDRANT_URL: z.url().default('http://localhost:6333'),
  QDRANT_COLLECTION: z.string().default('studymate_chunks'),
  EMBEDDING_MODEL: z.string().default('local-multilingual-feature-hash-v1'),
  EMBEDDING_CACHE_DIR: z.string().default('.cache/embeddings'),
  DEEPSEEK_API_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  DEEPSEEK_BASE_URL: z.url().default('https://api.deepseek.com'),
  DEEPSEEK_MODEL: z.string().default('deepseek-v4-flash'),
  RETRIEVAL_TOP_K: z.coerce.number().int().min(1).max(20).default(8),
  RETRIEVAL_SCORE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.35),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Invalid server configuration: ${fields}`);
}

export const env = result.data;
