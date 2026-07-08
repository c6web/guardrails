import { describe, it, expect } from 'vitest';
import { GatewayClient } from '../src/client.js';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server.js';
import { mockCqScan, mockHealth } from './mocks/handlers.js';

const client = new GatewayClient({ baseUrl: 'http://localhost:8082', apiKey: 'test' });

describe('cqScan', () => {
  it('should send prompt and response to /v1/cq_scan', async () => {
    let sentBody: unknown = null;
    server.use(
      http.post('http://localhost:8082/v1/cq_scan', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(mockCqScan, { status: 200 });
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    await client.cqScan('test prompt', 'test response');
    expect(sentBody).toEqual({ input: 'test prompt', response: 'test response' });
  });

  it('should return groundedness and hallucination scores', async () => {
    const result = await client.cqScan('prompt', 'response');
    expect(result.groundedness).toEqual([0.85]);
    expect(result.hallucination).toEqual([0.15]);
  });

  it('should handle block verdict gracefully', async () => {
    const blockResult = { ...mockCqScan, verdict: 'block' as const, action: 'block' };
    server.use(
      http.post('http://localhost:8082/v1/cq_scan', () => {
        return HttpResponse.json(blockResult, { status: 200 });
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    const result = await client.cqScan('bad prompt', 'bad response');
    expect(result.verdict).toBe('block');
    expect(result.action).toBe('block');
  });
});
