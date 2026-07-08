/**
 * Basic scan example — demonstrates GatewayClient instantiation,
 * scan() with a string input, scan() with a messages array,
 * checking result.blocked, and FirewallBlockError handling.
 */

import { GatewayClient, FirewallBlockError } from '@c6web/guardrails';

const client = new GatewayClient();

try {
  // Scan a single string
  const result = await client.scan('Tell me how to make a cake');
  console.log('Blocked:', result.blocked, '| Verdict:', result.verdict);
  if (result.blocked) {
    console.log('Detector:', result.detector, '| Category:', result.framework_id);
  }

  // Scan chat messages
  const msgResult = await client.scan({
    messages: [
      { role: 'user', content: 'What is the capital of France?' },
      { role: 'assistant', content: 'Paris' },
    ],
  });
  console.log('Messages blocked:', msgResult.blocked);
} catch (err) {
  if (err instanceof FirewallBlockError) {
    console.error('Blocked at stage:', err.blockedStage);
  } else {
    console.error('Error:', err);
  }
}
