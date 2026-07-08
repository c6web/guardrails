import type { ChatCompletionChunk } from './types/chat.js';
import type { GatewayHealth } from './types/health.js';
import { GatewayError, FirewallBlockError, RateLimitError, AuthenticationError, GatewayUnavailableError } from './errors.js';

export class Transport {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private timeoutMs: number,
    private maxRetries: number,
    private extraHeaders: Record<string, string>,
  ) {}

  async request<T>(method: string, path: string, body?: unknown, options?: { noAuth?: boolean }): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': '@c6web/guardrails/1.0.0',
          ...this.extraHeaders,
        };

        if (!options?.noAuth) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        if (body !== undefined) {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);

        if (response.ok) {
          return (await response.json()) as T;
        }

        const errorBody = await this.tryParseErrorBody(response);
        const error = this.buildError(response.status, errorBody, response);

        if (error.status < 500) {
          throw error;
        }

        throw error;
      } catch (err) {
        if (err instanceof GatewayError && err.status < 500) {
          throw err;
        }

        if (attempt === this.maxRetries) {
          if (err instanceof TypeError) {
            throw new GatewayUnavailableError(`Network error: ${err.message}`, 502);
          }
          throw err;
        }

        if (err instanceof GatewayUnavailableError || err instanceof TypeError) {
          const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 10_000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw new GatewayError('Max retries exceeded', 502);
  }

  async *streamRequest(path: string, body: Record<string, unknown>): AsyncGenerator<ChatCompletionChunk> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': '@c6web/guardrails/1.0.0',
        'Authorization': `Bearer ${this.apiKey}`,
        ...this.extraHeaders,
      };

      const requestBody = { ...body, stream: true };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await this.tryParseErrorBody(response);
        throw this.buildError(response.status, errorBody, response);
      }

      if (!response.body) {
        throw new GatewayError('Response body is not readable', 500);
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data) as ChatCompletionChunk;
              yield parsed;
            } catch {
              // skip
            }
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
      reader?.cancel();
    }
  }

  async healthRequest(): Promise<GatewayHealth> {
    return this.request<GatewayHealth>('GET', '/health', undefined, { noAuth: true });
  }

  private async tryParseErrorBody(response: Response): Promise<Record<string, unknown> | undefined> {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }

  private parseRetryAfter(response: Response): number {
    const header = response.headers.get('retry-after');
    if (!header) return 5;
    const seconds = parseInt(header, 10);
    if (!isNaN(seconds)) return seconds;
    const date = new Date(header);
    if (!isNaN(date.getTime())) {
      return Math.ceil((date.getTime() - Date.now()) / 1000);
    }
    return 5;
  }

  private buildError(status: number, body: Record<string, unknown> | undefined, response: Response): GatewayError {
    const message = (body?.message as string) ?? response.statusText ?? 'Unknown error';
    const code = body?.code as string | undefined;
    const requestId = (body?.request_id as string | undefined) ?? response.headers.get('x-request-id') ?? undefined;
    const hint = body?.hint as string | undefined;

    switch (status) {
      case 401:
        return new AuthenticationError(message, 401);
      case 403:
        if (body?.type === 'firewall_block') {
          return new FirewallBlockError(
            message,
            403,
            code,
            requestId,
            hint,
            body?.blocked_stage as string | undefined,
          );
        }
        return new GatewayError(message, status, code, requestId, hint);
      case 429:
        return new RateLimitError(message, 429, this.parseRetryAfter(response), code, requestId);
      default:
        if (status >= 500) {
          return new GatewayUnavailableError(message, status as 502 | 503);
        }
        return new GatewayError(message, status, code, requestId, hint);
    }
  }
}
