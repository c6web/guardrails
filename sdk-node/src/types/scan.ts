import type { ChatMessage } from './chat.js';

export interface SemanticMatch {
  id: string;
  name: string;
  similarity: number;
}

export interface PipelineTraceStage {
  name: string;
  result: string;
  duration_ms: number;
  details?: unknown;
}

export interface PipelineTrace {
  stages: PipelineTraceStage[];
  final_decision: string;
}

export interface ScanRequest {
  /** Free-text to scan. Mutually exclusive with messages/prompt/text. */
  input?: string;
  /** Chat messages to scan. */
  messages?: ChatMessage[];
  /** Legacy prompt string. */
  prompt?: string;
  /** Alternative text input. */
  text?: string;
}

export interface ScanResult {
  object: 'firewall.scan';
  request_id: string;
  verdict: 'allow' | 'block';
  final_decision: 'allow' | 'block';
  blocked_stage: string | null;
  detector: string | null;
  framework_id: string | null;
  confidence: number | null;
  reason: string;
  semantic_matches: SemanticMatch[];
  trace: PipelineTrace | null;
  duration_ms: number;
}
