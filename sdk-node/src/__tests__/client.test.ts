import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GatewayClient } from '../client.js';
import { Transport } from '../transport.js';
import type { ScanResult, CqScanResult, ChatCompletionResponse, ChatCompletionChunk } from '../types/index.js';

const mockHealth = {
  status: 'healthy',
  timestamp: '2025-01-01T00:00:00Z',
  data_db: true,
  log_db: true,
  cache_loaded_at: '2025-01-01T00:00:00Z',
  cache_next_reload_at: '2025-01-01T01:00:00Z',
  cache_next_reload_in: '3600s',
  detection_degraded: false,
};

const mockScanResult: ScanResult = {
  object: 'firewall.scan',
  request_id: 'req_123',
  verdict: 'allow',
  final_decision: 'allow',
  blocked_stage: null,
  detector: null,
  framework_id: null,
  confidence: null,
  reason: 'No threats detected',
  semantic_matches: [],
  trace: null,
  duration_ms: 10,
};

const mockBlockedResult: ScanResult = {
  object: 'firewall.scan',
  request_id: 'req_456',
  verdict: 'block',
  final_decision: 'block',
  blocked_stage: 'input_scanner',
  detector: 'test_detector',
  framework_id: 'fw_001',
  confidence: 0.95,
  reason: 'Threat detected',
  semantic_matches: [{ id: 'tm_001', name: 'test_threat', similarity: 0.95 }],
  trace: {
    stages: [{ name: 'input_scanner', result: 'block', duration_ms: 5, details: {} }],
    final_decision: 'block',
  },
  duration_ms: 10,
};

const mockCqResult: CqScanResult = {
  object: 'firewall.cq_scan',
  request_id: 'req_789',
  groundedness: [0.8],
  relevance: [0.9],
  hallucination: [0.1],
  verdict: 'allow',
  action: 'none',
  reason: 'Content quality ok',
  duration_ms: 20,
};

vi.mock('../transport.js', () => {
  const mockRequest = vi.fn();
  const mockHealthRequest = vi.fn();
  const mockStreamRequest = vi.fn();

  return {
    Transport: vi.fn().mockImplementation(() => ({
      request: mockRequest,
      healthRequest: mockHealthRequest,
      streamRequest: mockStreamRequest,
    })),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env['GATEWAY_URL'];
  delete process.env['GATEWAY_API_KEY'];
  delete process.env['GATEWAY_TIMEOUT'];
  delete process.env['GATEWAY_MAX_RETRIES'];
});

function getTransportMock() {
  return (Transport as ReturnType<typeof vi.fn>).mock.results[0].value;
}

describe('GatewayClient', () => {
  describe('constructor', () => {
    it('should use defaults when no options provided', () => {
      const client = new GatewayClient();
      expect(client).toBeInstanceOf(GatewayClient);
      expect(Transport).toHaveBeenCalledWith('http://localhost:8082', '', 30000, 3, {});
    });

    it('should use env vars when set', () => {
      process.env['GATEWAY_URL'] = 'https://gw.example.com/';
      process.env['GATEWAY_API_KEY'] = 'ak_test_123';
      process.env['GATEWAY_TIMEOUT'] = '15';
      process.env['GATEWAY_MAX_RETRIES'] = '5';

      new GatewayClient();
      expect(Transport).toHaveBeenCalledWith('https://gw.example.com', 'ak_test_123', 15000, 5, {});
    });

    it('should strip trailing slash from baseUrl', () => {
      process.env['GATEWAY_URL'] = 'https://gw.example.com/';
      new GatewayClient();
      expect(Transport).toHaveBeenCalledWith('https://gw.example.com', '', 30000, 3, {});
    });

    it('should not strip non-trailing slashes', () => {
      process.env['GATEWAY_URL'] = 'https://gw.example.com/path';
      new GatewayClient();
      expect(Transport).toHaveBeenCalledWith('https://gw.example.com/path', '', 30000, 3, {});
    });

    it('should merge custom headers', () => {
      new GatewayClient({ headers: { 'X-Custom': 'value' } });
      expect(Transport).toHaveBeenCalledWith('http://localhost:8082', '', 30000, 3, { 'X-Custom': 'value' });
    });

    it('should not throw when apiKey is empty', () => {
      expect(() => new GatewayClient()).not.toThrow();
    });
  });

  describe('isHealthy', () => {
    it('should return true when health status is healthy', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();
      transport.healthRequest.mockResolvedValue(mockHealth);

      const result = await client.isHealthy();
      expect(result).toBe(true);
    });

    it('should return false when health status is unhealthy', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();
      transport.healthRequest.mockResolvedValue({ ...mockHealth, status: 'unhealthy' });

      const result = await client.isHealthy();
      expect(result).toBe(false);
    });

    it('should return false when health request throws', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();
      transport.healthRequest.mockRejectedValue(new Error('Network error'));

      const result = await client.isHealthy();
      expect(result).toBe(false);
    });

    it('should not throw even on network error', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();
      transport.healthRequest.mockRejectedValue(new Error('Timeout'));

      await expect(client.isHealthy()).resolves.toBe(false);
    });
  });

  describe('isSafe', () => {
    it('should return true when scan verdict is allow', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();
      transport.request.mockResolvedValue(mockScanResult);

      const result = await client.isSafe('harmless text');
      expect(result).toBe(true);
    });

    it('should return false when scan verdict is block', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();
      transport.request.mockResolvedValue(mockBlockedResult);

      const result = await client.isSafe('malicious text');
      expect(result).toBe(false);
    });

    it('should throw when network fails', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();
      transport.request.mockRejectedValue(new Error('Network error'));

      await expect(client.isSafe('test')).rejects.toThrow('Network error');
    });
  });

  describe('health', () => {
    it('should delegate to transport.healthRequest', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();
      transport.healthRequest.mockResolvedValue(mockHealth);

      const result = await client.health();
      expect(result).toEqual(mockHealth);
      expect(transport.healthRequest).toHaveBeenCalledOnce();
    });
  });

  describe('scan', () => {
    it('should wrap string input as { input } and POST to /v1/scan', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();
      transport.request.mockResolvedValue(mockScanResult);

      const result = await client.scan('hello world');
      expect(result).toEqual({ ...mockScanResult, blocked: false });
      expect(transport.request).toHaveBeenCalledWith('POST', '/v1/scan', { input: 'hello world' });
    });

    it('should pass ScanRequest object as-is', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();
      transport.request.mockResolvedValue(mockScanResult);

      const scanReq = { messages: [{ role: 'user' as const, content: 'hello' }] };
      const result = await client.scan(scanReq);
      expect(result).toEqual({ ...mockScanResult, blocked: false });
      expect(transport.request).toHaveBeenCalledWith('POST', '/v1/scan', scanReq);
    });

    it('should include blocked property based on verdict', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();
      transport.request.mockResolvedValue(mockBlockedResult);

      const result = await client.scan('block me');
      expect(result.blocked).toBe(true);
      expect(result.verdict).toBe('block');
    });
  });

  describe('cqScan', () => {
    it('should POST to /v1/cq_scan with input and response', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();
      transport.request.mockResolvedValue(mockCqResult);

      const result = await client.cqScan('test prompt', 'test response');
      expect(result).toEqual(mockCqResult);
      expect(transport.request).toHaveBeenCalledWith('POST', '/v1/cq_scan', { input: 'test prompt', response: 'test response' });
    });
  });

  describe('chat', () => {
    const request = {
      model: 'gpt-4',
      messages: [{ role: 'user' as const, content: 'Hello' }],
    };

    const mockResponse: ChatCompletionResponse = {
      id: 'chatcmpl_123',
      object: 'chat.completion',
      created: 1700000000,
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hi there!' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    it('should POST to /v1/chat/completions with stream: false', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();
      transport.request.mockResolvedValue(mockResponse);

      const result = await client.chat(request);
      expect(result).toEqual(mockResponse);
      expect(transport.request).toHaveBeenCalledWith('POST', '/v1/chat/completions', {
        ...request,
        stream: false,
      });
    });

    it('should return ChatCompletionResponse with id, choices, usage', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();
      transport.request.mockResolvedValue(mockResponse);

      const result = await client.chat(request);
      expect(result.id).toBe('chatcmpl_123');
      expect(result.choices).toHaveLength(1);
      expect(result.choices[0].message.content).toBe('Hi there!');
      expect(result.usage?.total_tokens).toBe(15);
    });
  });

  describe('chatStream', () => {
    const request = {
      model: 'gpt-4',
      messages: [{ role: 'user' as const, content: 'Hello' }],
    };

    async function collectStream(iterable: AsyncIterable<ChatCompletionChunk>): Promise<ChatCompletionChunk[]> {
      const chunks: ChatCompletionChunk[] = [];
      for await (const chunk of iterable) {
        chunks.push(chunk);
      }
      return chunks;
    }

    it('should POST to /v1/chat/completions with stream: true', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();

      await client.chatStream(request);
      expect(transport.streamRequest).toHaveBeenCalledWith('/v1/chat/completions', {
        ...request,
        stream: true,
      });
    });

    it('should return async iterable that yields chunks', async () => {
      const client = new GatewayClient();
      const transport = getTransportMock();

      const chunk1: ChatCompletionChunk = {
        id: 'chatcmpl_123',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model: 'gpt-4',
        choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
      };

      const chunk2: ChatCompletionChunk = {
        id: 'chatcmpl_123',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model: 'gpt-4',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      };

      async function* mockStream() {
        yield chunk1;
        yield chunk2;
      }

      transport.streamRequest.mockReturnValue(mockStream());

      const stream = await client.chatStream(request);
      const chunks = await collectStream(stream);
      expect(chunks).toHaveLength(2);
      expect(chunks[0].choices[0].delta.content).toBe('Hello');
      expect(chunks[1].choices[0].finish_reason).toBe('stop');
    });
  });
});
