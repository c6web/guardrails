import { describe, it, expect, beforeEach } from 'vitest';
import { GatewayClient } from '../src/client.js';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server.js';
import {
  mockScanAllow,
  mockScanBlock,
  mockHealth,
  resetRequestCount,
} from './mocks/handlers.js';
import {
  FirewallBlockError,
  AuthenticationError,
  RateLimitError,
  GatewayUnavailableError,
} from '../src/errors.js';

const client = new GatewayClient({ baseUrl: 'http://localhost:8082', apiKey: 'test' });

beforeEach(() => {
  resetRequestCount();
});

describe('scan', () => {
  it('should send string input wrapped as { input }', async () => {
    let sentBody: unknown = null;
    server.use(
      http.post('http://localhost:8082/v1/scan', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(mockScanAllow, { status: 200 });
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    await client.scan('text');
    expect(sentBody).toEqual({ input: 'text' });
  });

  it('should send full ScanRequest object as-is', async () => {
    let sentBody: unknown = null;
    server.use(
      http.post('http://localhost:8082/v1/scan', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(mockScanAllow, { status: 200 });
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    const req = { messages: [{ role: 'user' as const, content: 'hello' }] };
    await client.scan(req);
    expect(sentBody).toEqual(req);
  });

  it('should return blocked: false for allow verdict', async () => {
    const result = await client.scan('safe text');
    expect(result.blocked).toBe(false);
    expect(result.verdict).toBe('allow');
  });

  it('should return blocked: true and details for block verdict', async () => {
    server.use(
      http.post('http://localhost:8082/v1/scan', () => {
        return HttpResponse.json(mockScanBlock, { status: 200 });
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    const result = await client.scan('bad text');
    expect(result.blocked).toBe(true);
    expect(result.blocked_stage).toBe('input_scanner');
    expect(result.detector).toBe('test_detector');
    expect(result.framework_id).toBe('fw_001');
  });

  it('should throw FirewallBlockError on 403 with firewall block body', async () => {
    server.use(
      http.post('http://localhost:8082/v1/scan', () => {
        return HttpResponse.json(
          {
            type: 'firewall_block',
            message: 'Request blocked by firewall',
            request_id: 'req_blocked_001',
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
      await client.scan('block me');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FirewallBlockError);
      expect((err as FirewallBlockError).requestId).toBe('req_blocked_001');
      expect((err as FirewallBlockError).blockedStage).toBe('input_scanner');
    }
  });

  it('should throw AuthenticationError on 401', async () => {
    server.use(
      http.post('http://localhost:8082/v1/scan', () => {
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
      await client.scan('test');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthenticationError);
    }
  });

  it('should throw RateLimitError on 429 with retry-after header', async () => {
    server.use(
      http.post('http://localhost:8082/v1/scan', () => {
        return new HttpResponse(
          JSON.stringify({ message: 'Rate limited' }),
          {
            status: 429,
            headers: { 'Retry-After': '5' },
          },
        );
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    try {
      await client.scan('test');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).retryAfter).toBe(5);
    }
  });

  it('should retry on 502 and succeed on second attempt', async () => {
    let callCount = 0;
    server.use(
      http.post('http://localhost:8082/v1/scan', () => {
        callCount++;
        if (callCount < 2) {
          return new HttpResponse(null, { status: 502 });
        }
        return HttpResponse.json(mockScanAllow, { status: 200 });
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    const result = await client.scan('retry me');
    expect(result.verdict).toBe('allow');
    expect(callCount).toBe(2);
  });

  it('should exhaust retries on repeated 502 and throw GatewayUnavailableError', async () => {
    let callCount = 0;
    server.use(
      http.post('http://localhost:8082/v1/scan', () => {
        callCount++;
        return new HttpResponse(null, { status: 502 });
      }),
      http.get('http://localhost:8082/health', () => {
        return HttpResponse.json(mockHealth, { status: 200 });
      }),
    );
    const maxRetries = 2;
    const retryClient = new GatewayClient({
      baseUrl: 'http://localhost:8082',
      apiKey: 'test',
      maxRetries,
    });
    try {
      await retryClient.scan('exhaust me');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayUnavailableError);
      expect(callCount).toBe(maxRetries + 1);
    }
  });
});
