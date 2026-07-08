import { Transport } from './transport.js';
import type { GatewayHealth } from './types/health.js';
import type { ScanRequest, ScanResult } from './types/scan.js';
import type { CqScanResult } from './types/cq_scan.js';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from './types/chat.js';
import type { EmbeddingResult } from './types/embedding.js';
import type { ModerationResult } from './types/moderation.js';

export interface GatewayClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

export class GatewayClient {
  private transport: Transport;

  constructor(options: GatewayClientOptions = {}) {
    let baseUrl = options.baseUrl || process.env['GATEWAY_URL'] || 'http://localhost:8082';
    const apiKey = options.apiKey || process.env['GATEWAY_API_KEY'] || '';
    const timeout = options.timeout ?? (Number(process.env['GATEWAY_TIMEOUT']) * 1000 || 30_000);
    const maxRetries = options.maxRetries ?? (Number(process.env['GATEWAY_MAX_RETRIES']) || 3);
    const headers = options.headers ?? {};

    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }

    this.transport = new Transport(baseUrl, apiKey, timeout, maxRetries, headers);
  }

  async health(): Promise<GatewayHealth> {
    return this.transport.healthRequest();
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.health();
      return result.status === 'healthy';
    } catch {
      return false;
    }
  }

  async isSafe(input: string): Promise<boolean> {
    const result = await this.scan(input);
    return result.verdict === 'allow';
  }

  async scan(input: string | ScanRequest): Promise<ScanResult & { blocked: boolean }> {
    const body: ScanRequest = typeof input === 'string' ? { input } : input;
    const result = await this.transport.request<ScanResult>('POST', '/v1/scan', body);
    return Object.assign(result, { blocked: result.verdict === 'block' });
  }

  async cqScan(input: string, response: string): Promise<CqScanResult> {
    return this.transport.request<CqScanResult>('POST', '/v1/cq_scan', { input, response });
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const body = { ...request, stream: false };
    return this.transport.request<ChatCompletionResponse>('POST', '/v1/chat/completions', body);
  }

  chatStream(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk> {
    const body = { ...request, stream: true };
    return this.transport.streamRequest('/v1/chat/completions', body);
  }

  async embed(input: string | string[], model?: string): Promise<EmbeddingResult> {
    return this.transport.request<EmbeddingResult>('POST', '/v1/embeddings', {
      input,
      model: model ?? 'text-embedding-3-small',
    });
  }

  async moderate(input: string | string[], model?: string): Promise<ModerationResult> {
    return this.transport.request<ModerationResult>('POST', '/v1/moderations', {
      input,
      model: model ?? 'c6-guardrails-moderation',
    });
  }
}
