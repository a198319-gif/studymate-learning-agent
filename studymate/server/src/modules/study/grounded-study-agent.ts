import { z } from 'zod';

export type ModelInput =
  | { type: 'message'; role: 'user' | 'assistant'; content: string }
  | { type: 'function_call'; callId: string; name: string; arguments: string }
  | { type: 'function_call_output'; callId: string; output: string };

export type ModelTool = {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ModelResponseFormat = {
  type: 'json_schema';
  name: string;
  schema: Record<string, unknown>;
};

export type ModelRequest = {
  instructions: string;
  input: ModelInput[];
  tools: ModelTool[];
  toolChoice: 'auto' | 'required' | 'none';
  responseFormat?: ModelResponseFormat;
};

export type ModelOutput =
  | { type: 'function_call'; callId: string; name: string; arguments: string }
  | { type: 'message'; text: string; sources: string[] };

export type ModelResponse = { output: ModelOutput[] };

export interface ResponsesProvider {
  create(request: ModelRequest): Promise<ModelResponse>;
}

export type RetrievedChunk = {
  materialId: string;
  sourceName: string;
  text: string;
  score: number;
};

export interface RetrievalService {
  search(input: { userId: string; materialIds: string[]; query: string; mode?: 'semantic' | 'selected' }): Promise<RetrievedChunk[]>;
}

export type StudyRequest = {
  userId: string;
  question: string;
  materialIds: string[];
  language: 'en' | 'zh';
  beginnerMode: boolean;
  retrievalMode?: 'semantic' | 'selected';
  responseFormat?: ModelResponseFormat;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export type StudyAnswer = {
  answer: string;
  sources: string[];
  groundingStatus: 'GROUNDED' | 'INSUFFICIENT';
};

const toolArgumentsSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  materialIds: z.array(z.string()).max(50).default([]),
});

function parseToolArguments(raw: string | undefined) {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw) as unknown;
    const result = toolArgumentsSchema.safeParse(value);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

const searchTool: ModelTool = {
  type: 'function',
  name: 'search_materials',
  description: 'Search only the ready study materials selected by the user.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['query', 'materialIds'],
    properties: {
      query: { type: 'string' },
      materialIds: { type: 'array', items: { type: 'string' } },
    },
  },
};

export class GroundedStudyAgent {
  constructor(
    private readonly provider: ResponsesProvider,
    private readonly retrieval: RetrievalService,
  ) {}

  async ask(request: StudyRequest): Promise<StudyAnswer> {
    const instructions = [
      'You are StudyMate. Answer only from selected uploaded materials.',
      'Always call search_materials before answering. Never use web search or general knowledge.',
      request.beginnerMode ? 'Explain for a beginner using plain language and a short example.' : '',
      request.language === 'zh' ? 'Reply in Chinese.' : 'Reply in English.',
    ].filter(Boolean).join(' ');
    const history = (request.history ?? []).slice(-12).map<ModelInput>((message) => ({
      type: 'message', role: message.role, content: message.content.slice(0, 10_000),
    }));
    const initialInput: ModelInput[] = [...history, { type: 'message', role: 'user', content: request.question }];
    const first = await this.provider.create({
      instructions,
      input: initialInput,
      tools: [searchTool],
      toolChoice: 'required',
    });
    const call = first.output.find(
      (item): item is Extract<ModelOutput, { type: 'function_call' }> =>
        item.type === 'function_call' && item.name === 'search_materials',
    );
    const parsedArguments = parseToolArguments(call?.arguments);
    const query = parsedArguments?.query ?? request.question;
    const selectedIds = new Set(request.materialIds);
    const requestedIds = parsedArguments?.materialIds ?? request.materialIds;
    const materialIds = requestedIds.filter((id) => selectedIds.has(id));
    const safeMaterialIds = materialIds.length > 0 ? materialIds : request.materialIds;
    const chunks = await this.retrieval.search({
      userId: request.userId,
      materialIds: safeMaterialIds,
      query,
      ...(request.retrievalMode ? { mode: request.retrievalMode } : {}),
    });

    if (chunks.length === 0) {
      return {
        answer:
          request.language === 'zh'
            ? '上传的学习资料中没有足够的信息回答这个问题。'
            : 'The uploaded materials do not contain enough information to answer this question.',
        sources: [],
        groundingStatus: 'INSUFFICIENT',
      };
    }

    const callId = call?.callId ?? 'server-search-1';
    const functionCall: ModelInput = call ?? {
      type: 'function_call',
      callId,
      name: 'search_materials',
      arguments: JSON.stringify({ query, materialIds: safeMaterialIds }),
    };
    const evidence = chunks.map(({ sourceName, text, score }) => ({ sourceName, text, score }));
    const final = await this.provider.create({
      instructions: request.responseFormat
        ? `${instructions} Return only JSON matching the required schema. Use exact source filenames in sourceReference fields.`
        : `${instructions} Cite filenames only. Do not invent page numbers. End the response with a separate line SOURCES_JSON:["exact filename"] listing only files that directly support the answer.`,
      input: [
        ...initialInput,
        functionCall,
        { type: 'function_call_output', callId, output: JSON.stringify(evidence) },
      ],
      tools: [],
      toolChoice: 'none',
      ...(request.responseFormat ? { responseFormat: request.responseFormat } : {}),
    });
    const message = final.output.find(
      (item): item is Extract<ModelOutput, { type: 'message' }> => item.type === 'message',
    );
    if (!message?.text) throw new Error('The model returned no answer.');
    const allowedSources = [...new Set(chunks.map((chunk) => chunk.sourceName))];

    const citedSources = message.sources.filter((source) => allowedSources.includes(source));
    return {
      answer: message.text,
      sources: request.responseFormat && citedSources.length === 0 ? allowedSources : citedSources,
      groundingStatus: 'GROUNDED',
    };
  }
}
