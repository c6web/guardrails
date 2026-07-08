export interface CqScanRequest {
  input: string;
  response: string;
}

export interface CqScanResult {
  object: 'firewall.cq_scan';
  request_id: string;
  groundedness: number[];
  relevance: number[];
  hallucination: number[];
  verdict: 'allow' | 'flag' | 'block';
  action: string;
  reason: string;
  duration_ms: number;
}
