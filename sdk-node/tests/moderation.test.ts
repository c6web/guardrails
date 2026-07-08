import { describe, it, expect } from 'vitest';
import { GatewayClient } from '../src/client.js';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server.js';
import { mockHealth } from './mocks/handlers.js';

const client = new GatewayClient({ baseUrl: 'http://localhost:8082', apiKey: 'test' });

describe('moderate', () => {
  it('should send single string input with default model', async () => {
    let sentBody: unknown = null;
    server.use(
      http.post('http://localhost:8082/v1/moderations', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(
          {
            id: 'mod_001',
            model: 'c6-guardrails-moderation',
            results: [{ flagged: false, categories: {}, category_scores: {} }],
          },
          { status: 200 },
        );
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    await client.moderate('text');
    expect(sentBody).toEqual({ input: 'text', model: 'c6-guardrails-moderation' });
  });

  it('should send batch array input', async () => {
    let sentBody: unknown = null;
    server.use(
      http.post('http://localhost:8082/v1/moderations', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(
          {
            id: 'mod_001',
            model: 'c6-guardrails-moderation',
            results: [
              { flagged: false, categories: {}, category_scores: {} },
              { flagged: false, categories: {}, category_scores: {} },
            ],
          },
          { status: 200 },
        );
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    await client.moderate(['a', 'b']);
    expect(sentBody).toEqual({ input: ['a', 'b'], model: 'c6-guardrails-moderation' });
  });

  it('should return flagged: true on one item', async () => {
    server.use(
      http.post('http://localhost:8082/v1/moderations', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        const input = body?.input;
        const isArray = Array.isArray(input);
        return HttpResponse.json(
          {
            id: 'mod_001',
            model: 'c6-guardrails-moderation',
            results: isArray
              ? [
                  { flagged: true, categories: {}, category_scores: {} },
                  { flagged: false, categories: {}, category_scores: {} },
                ]
              : [{ flagged: true, categories: {}, category_scores: {} }],
          },
          { status: 200 },
        );
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    const result = await client.moderate(['a', 'b']);
    expect(result.results[0].flagged).toBe(true);
    expect(result.results[1].flagged).toBe(false);
  });

  it('should use custom model when provided', async () => {
    let sentBody: unknown = null;
    server.use(
      http.post('http://localhost:8082/v1/moderations', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(
          {
            id: 'mod_001',
            model: 'custom',
            results: [{ flagged: false, categories: {}, category_scores: {} }],
          },
          { status: 200 },
        );
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    await client.moderate('text', 'custom');
    expect(sentBody).toEqual({ input: 'text', model: 'custom' });
  });
});
