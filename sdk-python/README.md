# C6 Guardrails — Python SDK

Python client library for [C6 Guardrails](https://github.com/c6ai/c6-guardrails).

## Installation

```bash
pip install c6-guardrails
```

Requires Python 3.10+.

## Quick Start (Async)

```python
import asyncio
from c6_guardrails import GatewayClient, GatewayClientOptions

async def main():
    client = GatewayClient(GatewayClientOptions(base_url="http://localhost:8082", api_key="ak_..."))
    result = await client.scan("Tell me a joke")
    print(f"Blocked: {result.blocked}, Detector: {result.detector}")
    await client.close()

asyncio.run(main())
```

## Quick Start (Sync)

```python
from c6_guardrails import GatewayClientOptions, SyncGatewayClient

with SyncGatewayClient(GatewayClientOptions(base_url="http://localhost:8082", api_key="ak_...")) as client:
    result = client.scan("Tell me a joke")
    print(f"Blocked: {result.blocked}")
```

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `GATEWAY_URL` | `http://localhost:8082` | Base URL of the gateway |
| `GATEWAY_API_KEY` | `""` | API key for authentication |
| `GATEWAY_TIMEOUT` | `30` | Request timeout in seconds |
| `GATEWAY_MAX_RETRIES` | `3` | Max retries on transient errors |

These can also be passed programmatically via `GatewayClientOptions`.

## API Reference

### `GatewayClient`

#### `health()` → `GatewayHealth`

Full health status of the gateway.

```python
health = await client.health()
```

| Field | Type | Description |
|---|---|---|
| `status` | `"healthy" \| "unhealthy"` | Overall gateway status |
| `timestamp` | `str` | ISO 8601 timestamp |
| `data_db` | `bool` | Data database reachable |
| `log_db` | `bool` | Log database reachable |
| `cache_loaded_at` | `str \| None` | Last cache load timestamp |
| `cache_next_reload_at` | `str \| None` | Next scheduled reload |
| `cache_next_reload_in` | `str \| None` | Time until next reload |
| `detection_degraded` | `bool` | Detection pipeline degraded |

#### `is_healthy()` → `bool`

Quick boolean check. Returns `True` when `health().status == "healthy"`.

#### `scan(input)` → `ScanResult`

Scan text or structured messages for threats.

```python
# Plain string
result = await client.scan("Some user input")

# Structured messages
result = await client.scan(ScanRequest(messages=[ChatMessage(role="user", content="Hello")]))
```

**`ScanRequest` fields:**

| Field | Type | Description |
|---|---|---|
| `input` | `str \| None` | Raw text input |
| `messages` | `list[ChatMessage] \| None` | Chat message list |
| `prompt` | `str \| None` | Prompt text |
| `text` | `str \| None` | Plain text |

**`ScanResult` fields:**

| Field | Type | Description |
|---|---|---|
| `verdict` | `"allow" \| "block"` | Final verdict |
| `blocked` | `bool` (property) | `True` if `verdict == "block"` |
| `detector` | `str \| None` | Matched detector name |
| `framework_id` | `str \| None` | Detection framework ID |
| `blocked_stage` | `str \| None` | Pipeline stage that blocked |
| `confidence` | `float \| None` | Detection confidence |
| `reason` | `str` | Human-readable reason |
| `request_id` | `str` | Unique request identifier |
| `semantic_matches` | `list[SemanticMatch]` | Semantic knowledge matches |
| `trace` | `PipelineTrace \| None` | Pipeline execution trace |
| `duration_ms` | `float` | Processing duration |

#### `is_safe(input)` → `bool`

Convenience method. Returns `True` when `scan(input).verdict == "allow"`.

#### `cq_scan(input, response)` → `CqScanResult`

Content quality evaluation of a prompt-response pair.

```python
result = await client.cq_scan("What is Paris?", "Paris is the capital of France.")
```

| Field | Type | Description |
|---|---|---|
| `verdict` | `"allow" \| "flag" \| "block"` | Quality verdict |
| `groundedness` | `list[float]` | Per-sentence groundedness scores |
| `relevance` | `list[float]` | Per-sentence relevance scores |
| `hallucination` | `list[float]` | Per-sentence hallucination scores |
| `action` | `str` | Recommended action |
| `reason` | `str` | Reason for the verdict |
| `request_id` | `str` | Unique request identifier |
| `duration_ms` | `float` | Processing duration |

#### `chat(request)` → `ChatCompletionResponse`

Non-streaming chat completion.

```python
request = ChatCompletionRequest(
    model="gpt-4o",
    messages=[ChatMessage(role="user", content="Hello!")],
)
response = await client.chat(request)
```

**`ChatCompletionResponse` fields:**

| Field | Type | Description |
|---|---|---|
| `id` | `str` | Response ID |
| `object` | `str` | Object type (`chat.completion`) |
| `created` | `int` | Unix timestamp of creation |
| `model` | `str` | Model used |
| `choices` | `list[ChatCompletionChoice]` | Completion choices |
| `usage` | `ChatCompletionUsage \| None` | Token usage |

Raises `FirewallBlockError` if the request is blocked by a policy.

#### `chat_stream(request)` → `AsyncIterator[ChatCompletionChunk]`

Streaming chat completion.

```python
async for chunk in client.chat_stream(request):
    for choice in chunk.choices:
        if content := choice.delta.get("content"):
            print(content, end="", flush=True)
```

#### `embed(input, model=None)` → `EmbeddingResult`

Generate embeddings for text.

```python
# Single text
result = await client.embed("Hello, world!")

# Batch
result = await client.embed(["text one", "text two"])
```

| Field | Type | Description |
|---|---|---|
| `data` | `list[EmbeddingData]` | Per-input embedding vectors |
| `model` | `str` | Model used |
| `usage` | `EmbeddingUsage` | Token usage |

Each `EmbeddingData` has `index: int`, `embedding: list[float]`, and `object: str`.

#### `moderate(input, model=None)` → `ModerationResult`

Content moderation check.

```python
result = await client.moderate(["text1", "text2"])
for item in result.results:
    print(f"Flagged: {item.flagged}")
    print(f"Categories: {item.categories}")
    print(f"Scores: {item.category_scores}")
```

| Field | Type | Description |
|---|---|---|
| `results` | `list[ModerationResultItem]` | Per-input results |
| `model` | `str` | Model used |

Each `ModerationResultItem` has `flagged: bool`, `categories: ModerationCategories`, and `category_scores: ModerationCategoryScores`.

### `SyncGatewayClient`

Synchronous wrapper around `GatewayClient`. All methods are the same as the async client but blocking.

```python
from c6_guardrails import GatewayClientOptions, SyncGatewayClient

client = SyncGatewayClient(GatewayClientOptions(api_key="ak_..."))
result = client.scan("test")
health = client.health()
client.close()

# Or use as a context manager:
with SyncGatewayClient(GatewayClientOptions(api_key="ak_...")) as client:
    result = client.scan("test")
```

Supports: `health()`, `is_healthy()`, `scan()`, `is_safe()`, `cq_scan()`, `chat()`, `embed()`, `moderate()`, `close()`.

## Error Handling

```python
from c6_guardrails import (
    AuthenticationError,
    FirewallBlockError,
    GatewayError,
    GatewayUnavailableError,
    RateLimitError,
)

try:
    result = await client.scan("some input")
except FirewallBlockError as e:
    print(f"Blocked by: {e.blocked_stage}, reason: {e}")
except RateLimitError as e:
    print(f"Rate limited, retry after {e.retry_after}s")
except AuthenticationError:
    print("Invalid API key")
except GatewayUnavailableError:
    print("Gateway is down")
except GatewayError as e:
    print(f"Gateway error ({e.status}): {e}")
```

| Exception | HTTP Status | Description |
|---|---|---|
| `FirewallBlockError` | 403 | Request blocked by a policy |
| `RateLimitError` | 429 | Too many requests (has `retry_after`) |
| `AuthenticationError` | 401 | Invalid or missing API key |
| `GatewayUnavailableError` | 502+ | Gateway or upstream unavailable |
| `GatewayError` | varies | Generic gateway error |

All error classes have `status`, `code`, `request_id`, and `hint` attributes where available.

## Examples

See the [`examples/`](examples/) directory for complete runnable scripts:

| Script | Description |
|---|---|
| `basic_scan.py` | Plain string and structured message scanning |
| `chat_streaming.py` | Streaming chat completions |
| `content_quality.py` | Content quality evaluation |
| `embeddings.py` | Text embeddings (single and batch) |
| `moderation.py` | Content moderation checks |
| `health_check.py` | Gateway health status |
| `sync_example.py` | Synchronous client usage |

Run any example with:

```bash
GATEWAY_URL=http://localhost:8082 GATEWAY_API_KEY=ak_... python examples/basic_scan.py
```

## Async vs Sync

**Async** (`GatewayClient`) is recommended for production use — it integrates
naturally with `asyncio`, FastAPI, and other async frameworks.

**Sync** (`SyncGatewayClient`) is provided for scripts, notebooks, Flask/Django
sync views, and environments where `async/await` is not convenient.
