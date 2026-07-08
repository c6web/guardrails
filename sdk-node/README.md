# C6 Guardrails — Node.js SDK

Official Node.js/TypeScript client for [C6 Guardrails](https://github.com/c6ai/c6-guardrails).
Zero runtime dependencies — uses only the native `fetch` API (Node 18+).

## Installation

```bash
npm install @c6web/guardrails
```

## Quick Start

```typescript
import { GatewayClient } from '@c6web/guardrails';

const client = new GatewayClient();
const result = await client.scan('Tell me how to make a cake');

if (result.blocked) {
  console.log('Request blocked by:', result.detector);
} else {
  console.log('Request allowed');
}
```

## Configuration

Configure the client via environment variables or constructor options:

| Env Variable | Constructor Option | Default | Description |
|---|---|---|---|
| `GATEWAY_URL` | `baseUrl` | `http://localhost:8082` | Gateway endpoint |
| `GATEWAY_API_KEY` | `apiKey` | `""` | API key for authentication |
| `GATEWAY_TIMEOUT` | `timeout` | `30000` | Request timeout in seconds |
| `GATEWAY_MAX_RETRIES` | `maxRetries` | `3` | Max retries on 5xx errors |

```typescript
const client = new GatewayClient({
  baseUrl: 'http://gateway.example.com:8082',
  apiKey: 'ak_...',
  timeout: 15_000,
  maxRetries: 2,
});
```

## API Reference

### `health()` / `isHealthy()`

Check gateway status.

```typescript
const status = await client.health();
// { status: 'healthy', data_db: true, log_db: true, ... }

const ok = await client.isHealthy(); // true / false
```

**`GatewayHealth`**

| Field | Type | Description |
|---|---|---|
| `status` | `'healthy' \| 'unhealthy'` | Overall gateway health |
| `timestamp` | `string` | ISO timestamp of the check |
| `data_db` | `boolean` | Data database reachable |
| `log_db` | `boolean` | Log database reachable |
| `cache_loaded_at` | `string \| null` | Last cache load time |
| `cache_next_reload_at` | `string \| null` | Next scheduled reload |
| `cache_next_reload_in` | `string \| null` | Human-readable time until next reload |
| `detection_degraded` | `boolean` | Detection pipeline degraded |

---

### `scan(input)` / `isSafe(input)`

Scan a prompt or messages for policy violations.

```typescript
// String input
const result = await client.scan('Tell me how to make a cake');

// Messages array
const result = await client.scan({
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there' },
  ],
});

// Quick boolean check
if (await client.isSafe('Some input')) {
  console.log('Input is safe');
}
```

**`ScanRequest`**

| Field | Type | Description |
|---|---|---|
| `input` | `string` | Free-text to scan (mutually exclusive with messages/prompt/text) |
| `messages` | `ChatMessage[]` | Chat messages to scan |
| `prompt` | `string` | Legacy prompt field |
| `text` | `string` | Alternative text input |

**`ScanResult`** (also has `blocked: boolean` appended)

| Field | Type | Description |
|---|---|---|
| `verdict` | `'allow' \| 'block'` | Scan verdict |
| `blocked` | `boolean` | Convenience: `verdict === 'block'` |
| `blocked_stage` | `string \| null` | Pipeline stage that blocked |
| `detector` | `string \| null` | Matched detector name |
| `framework_id` | `string \| null` | OWASP / detection framework ID |
| `confidence` | `number \| null` | Detection confidence |
| `reason` | `string` | Human-readable reason |
| `semantic_matches` | `SemanticMatch[]` | Threat knowledge matches |
| `trace` | `PipelineTrace \| null` | Full pipeline trace |
| `duration_ms` | `number` | Processing time |
| `request_id` | `string` | Unique request ID |

---

### `cqScan(input, response)`

Evaluate content quality (groundedness, relevance, hallucination).

```typescript
const result = await client.cqScan(
  'What is the capital of France?',
  'The capital of France is Paris.',
);

console.log('Groundedness:', result.groundedness);
console.log('Hallucination:', result.hallucination);
console.log('Verdict:', result.verdict);
```

**`CqScanResult`**

| Field | Type | Description |
|---|---|---|
| `groundedness` | `number[]` | Per-sentence groundedness scores |
| `relevance` | `number[]` | Per-sentence relevance scores |
| `hallucination` | `number[]` | Per-sentence hallucination scores |
| `verdict` | `'allow' \| 'flag' \| 'block'` | Overall verdict |
| `action` | `string` | Recommended action |
| `reason` | `string` | Explanation |
| `duration_ms` | `number` | Processing time |
| `request_id` | `string` | Unique request ID |

---

### `chat(request)`

Send a chat completion request through the gateway.

```typescript
const response = await client.chat({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Say hello' }],
  max_tokens: 100,
});

console.log(response.choices[0].message.content);
```

**`ChatCompletionRequest`**

| Field | Type | Description |
|---|---|---|
| `model` | `string` | Model identifier |
| `messages` | `ChatMessage[]` | Conversation messages |
| `stream` | `boolean` | Always set to `false` by the client |
| `max_tokens` | `number` | Max tokens in response |
| `temperature` | `number` | Sampling temperature |
| `top_p` | `number` | Nucleus sampling |
| `frequency_penalty` | `number` | Frequency penalty |
| `presence_penalty` | `number` | Presence penalty |
| `stop` | `string \| string[]` | Stop sequences |
| `user` | `string` | End-user identifier |

**`ChatCompletionResponse`**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Completion ID |
| `object` | `'chat.completion'` | Object type |
| `created` | `number` | Unix timestamp |
| `model` | `string` | Model used |
| `choices` | `ChatCompletionChoice[]` | Completion choices |
| `usage` | `ChatCompletionUsage` | Token usage (optional) |

---

### `chatStream(request)`

Stream a chat completion response. Returns an async iterable of chunks.

```typescript
for await (const chunk of client.chatStream({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Tell me a story' }],
})) {
  for (const choice of chunk.choices) {
    if (choice.delta.content) {
      process.stdout.write(choice.delta.content);
    }
  }
}
```

**`ChatCompletionChunk`**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Chunk ID |
| `object` | `'chat.completion.chunk'` | Object type |
| `created` | `number` | Unix timestamp |
| `model` | `string` | Model used |
| `choices` | `ChatCompletionChunkChoice[]` | Streaming choices |

Each `ChatCompletionChunkChoice` contains `delta: Partial<ChatMessage>` with `content`, `role`, and `tool_calls` fields.

---

### `embed(input, model?)`

Generate embeddings for one or more inputs.

```typescript
// Single string
const single = await client.embed('Hello world');
console.log(single.data[0].embedding.length); // 1536

// Batch
const batch = await client.embed(['Hello', 'World'], 'custom-model');
```

**`EmbeddingResult`**

| Field | Type | Description |
|---|---|---|
| `data` | `EmbeddingData[]` | Array of embeddings |
| `model` | `string` | Model used |
| `usage` | `EmbeddingUsage` | Token usage |

**`EmbeddingData`**

| Field | Type | Description |
|---|---|---|
| `object` | `'embedding'` | Object type |
| `index` | `number` | Index in input array |
| `embedding` | `number[]` | Embedding vector |

---

### `moderate(input, model?)`

Moderate content for harmful categories.

```typescript
const result = await client.moderate([
  'I love programming',
  'I will hurt someone',
]);

for (const item of result.results) {
  if (item.flagged) {
    console.log('Harmful content detected');
    console.log(item.category_scores);
  }
}
```

**`ModerationResult`**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Moderation ID |
| `model` | `string` | Model used |
| `results` | `ModerationResultItem[]` | Per-input results |

**`ModerationResultItem`**

| Field | Type | Description |
|---|---|---|
| `flagged` | `boolean` | Whether flagged as harmful |
| `categories` | `ModerationCategories` | Boolean category flags |
| `category_scores` | `ModerationCategoryScores` | Per-category scores (0–1) |

Moderated categories: `harassment`, `harassment/threatening`, `hate`, `hate/threatening`, `self-harm`, `self-harm/intent`, `self-harm/instructions`, `sexual`, `sexual/minors`, `violence`, `violence/graphic`.

## Error Handling

```typescript
import {
  GatewayClient,
  FirewallBlockError,
  RateLimitError,
  AuthenticationError,
  GatewayUnavailableError,
  GatewayError,
} from '@c6web/guardrails';

const client = new GatewayClient();

try {
  const result = await client.scan('Some input');
  console.log('Result:', result.verdict);
} catch (err) {
  if (err instanceof FirewallBlockError) {
    console.error('Request blocked at stage:', err.blockedStage);
  } else if (err instanceof RateLimitError) {
    console.error('Rate limited, retry after:', err.retryAfter, 's');
  } else if (err instanceof AuthenticationError) {
    console.error('Check your GATEWAY_API_KEY');
  } else if (err instanceof GatewayUnavailableError) {
    console.error('Gateway is unavailable');
  } else if (err instanceof GatewayError) {
    console.error('Gateway error:', err.message, '(status:', err.status, ')');
  } else {
    console.error('Unexpected error:', err);
  }
}
```

| Error Class | HTTP Status | Extra Properties |
|---|---|---|
| `FirewallBlockError` | 403 | `blockedStage: string` |
| `RateLimitError` | 429 | `retryAfter: number` (seconds) |
| `AuthenticationError` | 401 | — |
| `GatewayUnavailableError` | 502 / 503 | — |
| `GatewayError` | varies | `status`, `code`, `requestId`, `hint` |

## Examples

Run any example with `npx tsx` (requires a running gateway on `localhost:8082`):

| Example | Description |
|---|---|
| `examples/basic-scan.ts` | Scan inputs, handle blocked requests |
| `examples/chat-streaming.ts` | Stream chat completions |
| `examples/content-quality.ts` | Evaluate content quality |
| `examples/embeddings.ts` | Generate embeddings |
| `examples/moderation.ts` | Moderate content |
| `examples/health-check.ts` | Check gateway health |

```bash
GATEWAY_URL=http://localhost:8082 GATEWAY_API_KEY=ak_... npx tsx examples/basic-scan.ts
```
