import { describe, it, expect } from 'vitest';
import { GatewayClient } from '../src/client.js';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server.js';
import { mockHealth } from './mocks/handlers.js';
import { FirewallBlockError } from '../src/errors.js';

const client = new GatewayClient({ baseUrl: 'http://localhost:8082', apiKey: 'test' });

describe('chatStream', () => {
  const request = {
    model: 'gpt-4',
    messages: [{ role: 'user' as const, content: 'Hello' }],
  };

  async function collectStream(iterable: AsyncIterable<unknown>): Promise<unknown[]> {
    const chunks: unknown[] = [];
    for await (const chunk of iterable) {
      chunks.push(chunk);
    }
    return chunks;
  }

  it('should yield multiple SSE chunks from the stream', async () => {
    const encoder = new TextEncoder();
    const sseChunks = [
      'data: ' + JSON.stringify({
        id: 'chatcmpl_123',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model: 'gpt-4',
        choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
      }) + '\n\n',
      'data: ' + JSON.stringify({
        id: 'chatcmpl_123',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model: 'gpt-4',
        choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
      }) + '\n\n',
      'data: [DONE]\n\n',
    ];
    server.use(
      http.post('http://localhost:8082/v1/chat/completions', () => {
        const stream = new ReadableStream({
          start(controller) {
            for (const chunk of sseChunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        });
        return new HttpResponse(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    const stream = await client.chatStream(request);
    const chunks = await collectStream(stream);
    expect(chunks).toHaveLength(2);
    expect((chunks[0] as Record<string, unknown>).choices[0]).toHaveProperty('delta');
  });

  it('should complete after DONE signal', async () => {
    const stream = await client.chatStream(request);
    const chunks = await collectStream(stream);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should yield chunks with empty delta and finish_reason stop', async () => {
    const encoder = new TextEncoder();
    server.use(
      http.post('http://localhost:8082/v1/chat/completions', () => {
        const chunk = 'data: ' + JSON.stringify({
          id: 'chatcmpl_123',
          object: 'chat.completion.chunk',
          created: 1700000000,
          model: 'gpt-4',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        }) + '\n\n' + 'data: [DONE]\n\n';
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(chunk));
            controller.close();
          },
        });
        return new HttpResponse(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    const stream = await client.chatStream(request);
    const chunks = await collectStream(stream);
    expect(chunks).toHaveLength(1);
    expect((chunks[0] as Record<string, unknown>).choices[0].finish_reason).toBe('stop');
  });

  it('should throw FirewallBlockError on 403 before streaming', async () => {
    server.use(
      http.post('http://localhost:8082/v1/chat/completions', () => {
        return HttpResponse.json(
          {
            type: 'firewall_block',
            message: 'Stream blocked by firewall',
            request_id: 'req_stream_blocked',
            blocked_stage: 'input_scanner',
          },
          { status: 403 },
        );
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    try {
      const stream = await client.chatStream(request);
      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FirewallBlockError);
      expect((err as FirewallBlockError).requestId).toBe('req_stream_blocked');
    }
  });
});
