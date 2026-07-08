import { describe, it, expect } from 'vitest';
import { GatewayClient } from '../src/client.js';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server.js';
import { mockEmbedding, mockHealth } from './mocks/handlers.js';
import { GatewayUnavailableError } from '../src/errors.js';

const client = new GatewayClient({ baseUrl: 'http://localhost:8082', apiKey: 'test' });

describe('embed', () => {
  it('should send single string input with default model', async () => {
    let sentBody: unknown = null;
    server.use(
      http.post('http://localhost:8082/v1/embeddings', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(mockEmbedding, { status: 200 });
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    await client.embed('hello');
    expect(sentBody).toEqual({ input: 'hello', model: 'text-embedding-3-small' });
  });

  it('should send batch array input', async () => {
    let sentBody: unknown = null;
    server.use(
      http.post('http://localhost:8082/v1/embeddings', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(mockEmbedding, { status: 200 });
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    await client.embed(['a', 'b']);
    expect(sentBody).toEqual({ input: ['a', 'b'], model: 'text-embedding-3-small' });
  });

  it('should use custom model when provided', async () => {
    let sentBody: unknown = null;
    server.use(
      http.post('http://localhost:8082/v1/embeddings', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(mockEmbedding, { status: 200 });
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    await client.embed('text', 'custom-model');
    expect(sentBody).toEqual({ input: 'text', model: 'custom-model' });
  });

  it('should throw GatewayUnavailableError on 502', async () => {
    server.use(
      http.post('http://localhost:8082/v1/embeddings', () => {
        return new HttpResponse(null, { status: 502 });
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    const noRetryClient = new GatewayClient({ baseUrl: 'http://localhost:8082', apiKey: 'test', maxRetries: 0 });
    try {
      await noRetryClient.embed('test');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayUnavailableError);
    }
  });
});
