export const SDK_VERSION = '1.0.0';

export { GatewayClient, type GatewayClientOptions } from './client.js';
export {
  GatewayError,
  FirewallBlockError,
  RateLimitError,
  AuthenticationError,
  GatewayUnavailableError,
} from './errors.js';
export {
  type GatewayHealth,
  type ScanRequest,
  type ScanResult,
  type SemanticMatch,
  type CqScanRequest,
  type CqScanResult,
  type ChatMessage,
  type ChatCompletionRequest,
  type ChatCompletionResponse,
  type ChatCompletionChunk,
  type ChatCompletionChunkChoice,
  type ChatCompletionChoice,
  type EmbeddingRequest,
  type EmbeddingResult,
  type ModerationRequest,
  type ModerationResult,
} from './types/index.js';
