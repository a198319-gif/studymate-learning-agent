import { describe, expect, it } from 'vitest';

import {
  GroundedStudyAgent,
  type ModelRequest,
  type ModelResponse,
  type ResponsesProvider,
  type RetrievalService,
} from '../src/modules/study/grounded-study-agent.js';

class FakeProvider implements ResponsesProvider {
  readonly requests: ModelRequest[] = [];
  responses: ModelResponse[] = [];

  create(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (!response) throw new Error('Missing fake model response.');
    return Promise.resolve(response);
  }
}

class FakeRetrieval implements RetrievalService {
  calls: Array<{ userId: string; materialIds: string[]; query: string }> = [];
  results: Awaited<ReturnType<RetrievalService['search']>> = [];

  search(input: { userId: string; materialIds: string[]; query: string }) {
    this.calls.push(input);
    return Promise.resolve(this.results);
  }
}

describe('GroundedStudyAgent', () => {
  it('returns the fixed Chinese refusal without a second model call when evidence is insufficient', async () => {
    const provider = new FakeProvider();
    const retrieval = new FakeRetrieval();
    provider.responses = [{
      output: [{ type: 'function_call', callId: 'call-1', name: 'search_materials', arguments: '{"query":"量子纠缠","materialIds":["material-1"]}' }],
    }];
    const agent = new GroundedStudyAgent(provider, retrieval);

    const result = await agent.ask({
      userId: 'user-1',
      question: '资料里如何解释量子纠缠？',
      materialIds: ['material-1'],
      language: 'zh',
      beginnerMode: false,
    });

    expect(result).toEqual({
      answer: '上传的学习资料中没有足够的信息回答这个问题。',
      sources: [],
      groundingStatus: 'INSUFFICIENT',
    });
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.toolChoice).toBe('required');
  });

  it('injects the authenticated user into retrieval and intersects returned sources', async () => {
    const provider = new FakeProvider();
    const retrieval = new FakeRetrieval();
    retrieval.results = [
      { materialId: 'material-1', sourceName: 'Memory.pdf', text: 'Working memory is capacity limited.', score: 0.91 },
    ];
    provider.responses = [
      { output: [{ type: 'function_call', callId: 'call-1', name: 'search_materials', arguments: '{"query":"working memory","materialIds":["material-1","other-user-material"]}' }] },
      { output: [{ type: 'message', text: 'Working memory has limited capacity.', sources: ['Memory.pdf', 'Invented.pdf'] }] },
    ];
    const agent = new GroundedStudyAgent(provider, retrieval);

    const result = await agent.ask({
      userId: 'user-1',
      question: 'What is working memory?',
      materialIds: ['material-1'],
      language: 'en',
      beginnerMode: true,
    });

    expect(retrieval.calls).toEqual([{ userId: 'user-1', materialIds: ['material-1'], query: 'working memory' }]);
    expect(result.sources).toEqual(['Memory.pdf']);
    expect(result.groundingStatus).toBe('GROUNDED');
    expect(provider.requests[1]?.tools).toEqual([]);
    expect(provider.requests[1]?.toolChoice).toBe('none');
    expect(JSON.stringify(provider.requests)).not.toContain('web_search');
  });

  it('falls back to the user question when tool arguments are malformed', async () => {
    const provider = new FakeProvider();
    const retrieval = new FakeRetrieval();
    provider.responses = [{
      output: [{ type: 'function_call', callId: 'call-bad', name: 'search_materials', arguments: '{not-json' }],
    }];
    const agent = new GroundedStudyAgent(provider, retrieval);

    const result = await agent.ask({
      userId: 'user-1',
      question: '解释这份资料',
      materialIds: ['material-1'],
      language: 'zh',
      beginnerMode: false,
    });

    expect(retrieval.calls).toEqual([{ userId: 'user-1', materialIds: ['material-1'], query: '解释这份资料' }]);
    expect(result.groundingStatus).toBe('INSUFFICIENT');
  });

  it('includes bounded conversation history before the current question', async () => {
    const provider = new FakeProvider();
    const retrieval = new FakeRetrieval();
    provider.responses = [{ output: [{ type: 'function_call', callId: 'history-call', name: 'search_materials', arguments: '{"query":"follow up","materialIds":["material-1"]}' }] }];
    const agent = new GroundedStudyAgent(provider, retrieval);

    await agent.ask({
      userId: 'user-1', question: 'How is that different?', materialIds: ['material-1'], language: 'en', beginnerMode: false,
      history: [{ role: 'user', content: 'Explain working memory.' }, { role: 'assistant', content: 'It is capacity limited.' }],
    });

    expect(provider.requests[0]?.input.slice(0, 3)).toEqual([
      { type: 'message', role: 'user', content: 'Explain working memory.' },
      { type: 'message', role: 'assistant', content: 'It is capacity limited.' },
      { type: 'message', role: 'user', content: 'How is that different?' },
    ]);
  });

  it('forwards structured output requirements and safely cites retrieved sources', async () => {
    const provider = new FakeProvider();
    const retrieval = new FakeRetrieval();
    retrieval.results = [
      { materialId: 'material-1', sourceName: 'Memory.pdf', text: 'Spacing improves retention.', score: 0.9 },
    ];
    provider.responses = [
      { output: [{ type: 'function_call', callId: 'structured-call', name: 'search_materials', arguments: '{"query":"spacing","materialIds":[]}' }] },
      { output: [{ type: 'message', text: '{"answer":"Spacing"}', sources: [] }] },
    ];
    const responseFormat = {
      type: 'json_schema' as const,
      name: 'grounded_answer',
      schema: { type: 'object', properties: { answer: { type: 'string' } } },
    };
    const agent = new GroundedStudyAgent(provider, retrieval);

    const result = await agent.ask({
      userId: 'user-1',
      question: 'Create structured study content.',
      materialIds: ['material-1'],
      language: 'en',
      beginnerMode: false,
      retrievalMode: 'selected',
      responseFormat,
    });

    expect(provider.requests[1]?.responseFormat).toEqual(responseFormat);
    expect(result.sources).toEqual(['Memory.pdf']);
  });
});
