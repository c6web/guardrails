/**
 * Chat streaming example — demonstrates chatStream() with a simple
 * prompt, for await...of iteration over chunks, printing delta
 * content, and counting total tokens from the final chunk usage.
 */

import { GatewayClient } from '@c6web/guardrails';

const client = new GatewayClient();

let totalTokens = 0;

for await (const chunk of client.chatStream({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Say hello in 5 words' }],
})) {
  for (const choice of chunk.choices) {
    if (choice.delta.content) {
      process.stdout.write(choice.delta.content);
    }
    if (choice.finish_reason) {
      console.log('\nFinish reason:', choice.finish_reason);
    }
  }
}
