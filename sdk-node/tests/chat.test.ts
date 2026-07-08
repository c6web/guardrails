import { describe, it, expect } from 'vitest';
import { GatewayClient } from '../src/client.js';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server.js';
import { mockChatResponse, mockHealth } from './mocks/handlers.js';
import { FirewallBlockError, AuthenticationError } from '../src/errors.js';

const client = new GatewayClient({ baseUrl: 'http://localhost:8082', apiKey: 'test' });

describe('chat', () => {
  const request = {
    model: 'gpt-4',
    messages: [{ role: 'user' as const, content: 'Hello' }],
  };

  it('should send messages array and return ChatCompletionResponse', async () => {
    let sentBody: unknown = null;
    server.use(
      http.post('http://localhost:8082/v1/chat/completions', async ({ request: req }) => {
        sentBody = await req.json();
        return HttpResponse.json(mockChatResponse, { status: 200 });
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    const result = await client.chat(request);
    expect(result.id).toBe('chatcmpl_123');
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0].message.content).toBe('Hi there!');
    expect(sentBody).toHaveProperty('stream', false);
  });

  it('should throw FirewallBlockError on 403 with firewall block body', async () => {
    server.use(
      http.post('http://localhost:8082/v1/chat/completions', () => {
        return HttpResponse.json(
          {
            type: 'firewall_block',
            message: 'Chat blocked by firewall',
            request_id: 'req_chat_blocked',
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
      await client.chat(request);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FirewallBlockError);
      expect((err as FirewallBlockError).requestId).toBe('req_chat_blocked');
      expect((err as FirewallBlockError).blockedStage).toBe('input_scanner');
    }
  });

  it('should throw AuthenticationError on 401', async () => {
    server.use(
      http.post('http://localhost:8082/v1/chat/completions', () => {
        return HttpResponse.json(
          { message: 'Invalid API key' },
          { status: 401 },
        );
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    try {
      await client.chat(request);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthenticationError);
    }
  });
});
