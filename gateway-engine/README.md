# AI Firewall Gateway Engine

HTTP reverse proxy for AI LLM providers with OWASP LLM threat detection,
multi-provider failover, usage metering, and a full security scanning pipeline.

All endpoints listen on **`0.0.0.0:8082`**.

---

## Endpoints

### LLM Proxy (security-scanned)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/chat/completions` | App API key | OpenAI chat completions. Full scanning pipeline: ACL → rate limit → auth → quota → keyword/regex → embedding/semantic → LLM classifier → T2 intent analysis → enforcement. Supports streaming. |
| POST | `/v1/completions` | App API key | Legacy OpenAI completions (`prompt` field instead of `messages`). Translates to chat format for pipeline, translates response back to `text_completion` format. Supports streaming. |
| POST | `/v1/messages` | App API key | Anthropic Messages API. Body translated to OpenAI format for scanning, upstream/downstream dialect handled. Supports streaming. |
| POST | `/v1/responses` | App API key | OpenAI Responses API (newer `/v1/responses` format). Scans `input` and `instructions` fields. Supports streaming. |

### Embeddings

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/embeddings` | App API key | OpenAI-compatible text embeddings. Auth + forwarding only — no scanning. Returns standard OpenAI embedding response. |

### Moderation

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/moderations` | App API key | OpenAI-compatible moderation. Runs keyword/regex + LLM classifier on `input` text. Returns moderation categories (`harassment`, `hate`, `self-harm`, `sexual`, `violence`) with scores. |

### Model Discovery

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/v1/models` | None | Returns models from the cached `ai_providers` database table. Uses each provider's `model` field (falls back to `name`). No hardcoded model names. |

### Diagnostic (no security scanning)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/test/upstream` | App API key | Forward request to the app's upstream provider **with no scanning**. Used to verify provider connectivity independent of firewall rules. Input/output logged in `ai_request_logs`. |
| POST | `/v1/test/classification` | App API key | Run the configured LLM classifier on input text **without running the full pipeline**. Returns verdict, confidence, framework_id, and duration. Fails with 503 if no classifier is configured. |

### Passthrough (forwarded verbatim, scanned for threats)

| Method | Path | Auth | Description |
|---|---|---|---|
| Any | `/v1/files*` | App API key | SDK file endpoints — forwarded verbatim to upstream. Text content is scanned for keyword/regex threats before forwarding. |
| Any | `/v1/audio*` | App API key | Audio transcription/speech endpoints — forwarded verbatim. Text content scanned. |
| Any | `/v1/images*` | App API key | Image generation/editing endpoints — forwarded verbatim. Text content scanned. |

### Management

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Health check. Pings data DB + log DB with `SELECT 1`. Returns cache timing info. 200 = healthy, 503 = degraded. |
| GET | `/id` | None | Returns `{ "instance_id": "..." }` from `GATEWAY_INSTANCE_ID` env var. |
| POST | `/reload` | Gateway key **or** Admin key | Triggers full cache reload from PostgreSQL (detectors, providers, API keys, ACL, embeddings, threat knowledge). Rate-limited to 3 calls per 60s. |
| GET | `/metrics` | Admin key | Prometheus-format metrics (OpenMetrics text). Request counts, durations, decisions, cache reload stats. |

---

## Authentication

### App API Key
Used by all proxying endpoints (`/v1/chat/completions`, `/v1/completions`, `/v1/messages`, `/v1/responses`, `/v1/embeddings`, `/v1/moderations`, `/v1/test/*`, and passthrough paths). Sent as `Authorization: Bearer <key>`. Tied to a registered **ConnectedApp** in the database — determines provider chain, rate limits, usage quotas, and detector overrides.

### Gateway Control Key
Used by `/reload`. Sent as `Authorization: Bearer <key>`. Stored in the `gateway_api_keys` database table, hashed at rest. Checked with fallback to admin API key.

### Admin API Key
Used by `/metrics` (and accepted by `/reload` as fallback). Sent as `Authorization: Bearer <key>`. Stored in `admin_api_keys` database table, hashed at rest.

---

## Route Resolution Order

1. Explicitly registered routes (above) are matched first.
2. Passthrough prefixes `/v1/files`, `/v1/audio`, `/v1/images` are forwarded verbatim to the upstream provider with auth but no scanning (text is scanned for threats).
3. All other unknown paths return **404** `{"error":{"type":"not_found","code":"unknown_path"}}`.

ACL checking (network allow/deny lists) runs **before** all route matching, including for unknown paths. A blocked source IP gets 403 regardless of route.

---

## Env vars

| Variable | Default | Description |
|---|---|---|
| `DATA_PG_HOST` | — | PostgreSQL host for `ai_gateway_data` |
| `DATA_PG_PORT` | 5432 | PostgreSQL port |
| `DATA_PG_USER` | — | PostgreSQL user |
| `DATA_PG_PASSWORD` | — | PostgreSQL password |
| `DATA_PG_DB` | `ai_gateway_data` | PostgreSQL database |
| `PLATFORM_KEY_SECRET` | — | AES-256-GCM key for decrypting provider API keys |
| `GATEWAY_INSTANCE_ID` | **required** | Unique instance identifier. Scopes control keys and attributes log rows. Panics at startup if unset. |
| `RATE_LIMIT_RPM` | 60 | Per-app rate limit (requests per minute) |
| `PREAUTH_RATE_LIMIT_RPM` | 120 | Per-IP rate limit before auth |
| `GATEWAY_BODY_LIMIT_MB` | 32 | Max request body size |
| `SCAN_FAIL_CLOSED` | `false` | When true, classifier/embedding errors block the request instead of allowing it |
| `TRUSTED_PROXY_DEPTH` | 0 | Number of trusted reverse-proxy hops for source IP resolution |
| `OTEL_ENABLED` | `false` | When true, exports OpenTelemetry traces |
| `OTEL_SERVICE_NAME` | `gateway-engine` | OTel service name |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OTLP gRPC endpoint |
