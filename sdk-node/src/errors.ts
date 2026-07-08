export class GatewayError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public requestId?: string,
    public hint?: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export class FirewallBlockError extends GatewayError {
  constructor(
    message: string,
    status: 403,
    code?: string,
    requestId?: string,
    hint?: string,
    public blockedStage?: string,
  ) {
    super(message, status, code, requestId, hint);
    this.name = 'FirewallBlockError';
  }
}

export class RateLimitError extends GatewayError {
  constructor(
    message: string,
    status: 429,
    public retryAfter: number,
    code?: string,
    requestId?: string,
  ) {
    super(message, status, code, requestId);
    this.name = 'RateLimitError';
  }
}

export class AuthenticationError extends GatewayError {
  constructor(message: string, status: 401) {
    super(message, status);
    this.name = 'AuthenticationError';
  }
}

export class GatewayUnavailableError extends GatewayError {
  constructor(message: string, status: 502 | 503 = 502) {
    super(message, status);
    this.name = 'GatewayUnavailableError';
  }
}
