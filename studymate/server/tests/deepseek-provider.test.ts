import { describe, expect, it, vi } from 'vitest';

import { DeepSeekResponsesProvider } from '../src/modules/study/deepseek-responses-provider.js';

describe('DeepSeekResponsesProvider', () => {
  it('calls the Responses API with a bearer key and no web-search tool', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Grounded answer\nSOURCES_JSON:["notes.txt"]' }] }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const provider = new DeepSeekResponsesProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      fetcher,
    });

    const result = await provider.create({
      instructions: 'Use sources only.',
      input: [{ type: 'message', role: 'user', content: 'Question' }],
      tools: [{ type: 'function', name: 'search_materials', description: 'Search selected materials.', parameters: { type: 'object' } }],
      toolChoice: 'required',
    });

    expect(result.output).toEqual([{ type: 'message', text: 'Grounded answer', sources: ['notes.txt'] }]);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('https://api.deepseek.com/responses');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    const requestBody = typeof init?.body === 'string' ? init.body : '';
    expect(requestBody).not.toContain('web_search');
    expect((JSON.parse(requestBody) as { reasoning: { effort: string } }).reasoning.effort).toBe('none');
  });

  it('maps a non-JSON upstream response to a safe provider error', async () => {
    const provider = new DeepSeekResponsesProvider({
      apiKey: 'test-key', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash',
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 200 })),
    });

    await expect(provider.create({ instructions: 'Ground answers.', input: [], tools: [], toolChoice: 'none' }))
      .rejects.toMatchObject({ code: 'AI_PROVIDER_RESPONSE_INVALID', statusCode: 502 });
  });

  it('parses a source footer whose JSON array is on the next line', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Grounded answer\nSOURCES_JSON\n["notes.txt"]' }] }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const provider = new DeepSeekResponsesProvider({
      apiKey: 'test-key', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash',
      fetcher,
    });

    await expect(provider.create({
      instructions: 'Ground answers.',
      input: [],
      tools: [],
      toolChoice: 'none',
      responseFormat: {
        type: 'json_schema',
        name: 'grounded_answer',
        schema: { type: 'object', required: ['answer'], properties: { answer: { type: 'string' } } },
      },
    }))
      .resolves.toEqual({ output: [{ type: 'message', text: 'Grounded answer', sources: ['notes.txt'] }] });
    const requestBody = fetcher.mock.calls[0]?.[1]?.body;
    const parsedBody = JSON.parse(typeof requestBody === 'string' ? requestBody : '') as {
      reasoning: { effort: string };
      text: { format: { type: string; name: string } };
    };
    expect(parsedBody.reasoning.effort).toBe('none');
    expect(parsedBody.text.format).toMatchObject({ type: 'json_schema', name: 'grounded_answer' });
  });
});
