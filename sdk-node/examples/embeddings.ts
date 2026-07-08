/**
 * Embedding example — demonstrates embed() with a single string and
 * with a batch array, printing embedding dimensions.
 */

import { GatewayClient } from '@c6web/guardrails';

const client = new GatewayClient();

// Single string
const single = await client.embed('Hello world');
console.log('Single embedding dimensions:', single.data[0].embedding.length);

// Batch array
const batch = await client.embed(['Hello world', 'Goodbye world']);
console.log('Batch count:', batch.data.length);
console.log('Model:', batch.model);
console.log('Total tokens:', batch.usage.total_tokens);
