/**
 * Content quality scan example — demonstrates cqScan() with a
 * prompt/response pair, printing groundedness, relevance, and
 * hallucination scores, and handling the verdict field.
 */

import { GatewayClient } from '@c6web/guardrails';

const client = new GatewayClient();

const result = await client.cqScan(
  'What is the capital of France?',
  'The capital of France is Paris.',
);

console.log('Verdict:', result.verdict);
console.log('Action:', result.action);
console.log('Groundedness:', result.groundedness);
console.log('Relevance:', result.relevance);
console.log('Hallucination:', result.hallucination);
console.log('Reason:', result.reason);
