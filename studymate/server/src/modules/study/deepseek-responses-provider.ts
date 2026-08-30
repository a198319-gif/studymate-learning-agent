import { z } from 'zod';

import { AppError } from '../../shared/app-error.js';
import type { ModelInput, ModelOutput, ModelRequest, ModelResponse, ResponsesProvider } from './grounded-study-agent.js';

type DeepSeekOptions = {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetcher?: typeof fetch;
};

const responseSchema = z.object({
  status: z.string(),
  output: z.array(z.object({
    type: z.string(),
    call_id: z.string().optional(),
    name: z.string().optional(),
    arguments: z.string().optional(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  })),
});

const sourcesSchema = z.array(z.string().min(1).max(500)).max(50);

function parseAnswer(text: string): { text: string; sources: string[] } {
  const match = /\nSOURCES_JSON\s*:?\s*(\[[^\n]*\])\s*$/.exec(text);
  if (!match) return { text: text.trim(), sources: [] };
  try {
    const value: unknown = JSON.parse(match[1] ?? '[]');
    const sources = sourcesSchema.safeParse(value);
    return { text: text.slice(0, match.index).trim(), sources: sources.success ? sources.data : [] };
  } catch {
    return { text: text.slice(0, match.index).trim(), sources: [] };
  }
}

function apiInput(item: ModelInput): Record<string, unknown> {
  if (item.type === 'message') return item;
  if (item.type === 'function_call') {
    return { type: item.type, call_id: item.callId, name: item.name, arguments: item.arguments };
  }
  return { type: item.type, call_id: item.callId, output: item.output };
}

export class DeepSeekResponsesProvider implements ResponsesProvider {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: DeepSeekOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async create(request: ModelRequest): Promise<ModelResponse> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, '')}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.options.model,
          instructions: request.instructions,
          input: request.input.map(apiInput),
          tools: request.tools,
          tool_choice: request.toolChoice,
          reasoning: { effort: 'none' },
          max_output_tokens: 2_000,
          ...(request.responseFormat ? { text: { format: request.responseFormat } } : {}),
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new AppError(503, 'AI_PROVIDER_UNAVAILABLE', 'The study assistant is temporarily unavailable.');
    }

    if (!response.ok) {
      throw new AppError(503, 'AI_PROVIDER_UNAVAILABLE', 'The study assistant is temporarily unavailable.');
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AppError(502, 'AI_PROVIDER_RESPONSE_INVALID', 'The study assistant returned an invalid response.');
    }
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success || parsed.data.status !== 'completed') {
      throw new AppError(502, 'AI_PROVIDER_RESPONSE_INVALID', 'The study assistant returned an invalid response.');
    }

    const output: ModelOutput[] = [];
    for (const item of parsed.data.output) {
      if (item.type === 'function_call' && item.call_id && item.name && item.arguments) {
        output.push({ type: 'function_call', callId: item.call_id, name: item.name, arguments: item.arguments });
      } else if (item.type === 'message') {
        const text = item.content?.filter((part) => part.type === 'output_text').map((part) => part.text ?? '').join('') ?? '';
        if (text) output.push({ type: 'message', ...parseAnswer(text) });
      }
    }
    return { output };
  }
}
