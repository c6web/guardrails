/**
 * Moderation example — demonstrates moderate() with an array of
 * inputs, printing flagged status and category scores for each result.
 */

import { GatewayClient } from '@c6web/guardrails';

const client = new GatewayClient();

const result = await client.moderate([
  'I love programming',
  'I will hurt someone',
]);

for (const item of result.results) {
  console.log('Flagged:', item.flagged);
  if (item.flagged) {
    for (const [category, score] of Object.entries(item.category_scores)) {
      if (score > 0.1) {
        console.log(`  ${category}: ${score}`);
      }
    }
  }
}
