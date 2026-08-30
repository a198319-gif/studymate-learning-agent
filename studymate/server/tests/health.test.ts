import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

describe('GET /api/health', () => {
  it('returns a safe health response and request id', async () => {
    const response = await request(createApp()).get('/api/health');
    const body = response.body as unknown;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: 'ok' });
    expect(typeof (body as { requestId?: unknown }).requestId).toBe('string');
  });
});
