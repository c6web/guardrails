import os
from collections.abc import AsyncIterator
from dataclasses import dataclass, field, fields, is_dataclass
from typing import Any

from .transport import Transport, from_dict
from .types.chat import ChatCompletionChunk, ChatCompletionRequest, ChatCompletionResponse
from .types.cq_scan import CqScanResult
from .types.embedding import EmbeddingResult
from .types.health import GatewayHealth
from .types.moderation import ModerationResult
from .types.scan import ScanRequest, ScanResult


def _dataclass_to_dict(obj: Any) -> dict[str, Any]:
    if not is_dataclass(obj):
        return obj  # type: ignore[no-any-return]
    result: dict[str, Any] = {}
    extra: dict[str, Any] = {}
    for f in fields(obj):
        value = getattr(obj, f.name)
        if value is None:
            continue
        if f.name == "extra" and isinstance(value, dict):
            extra = value
            continue
        if is_dataclass(value):
            result[f.name] = _dataclass_to_dict(value)
        elif isinstance(value, list):
            result[f.name] = [
                _dataclass_to_dict(item) if is_dataclass(item) else item for item in value
            ]
        else:
            result[f.name] = value
    result.update(extra)
    return result


@dataclass
class GatewayClientOptions:
    base_url: str = ""
    api_key: str = ""
    timeout: float = 30.0
    max_retries: int = 3
    headers: dict[str, str] = field(default_factory=dict)


class GatewayClient:
    def __init__(self, options: GatewayClientOptions | None = None) -> None:
        opts = options or GatewayClientOptions()
        base_url = opts.base_url or os.getenv("GATEWAY_URL", "http://localhost:8082").rstrip("/")
        api_key = opts.api_key or os.getenv("GATEWAY_API_KEY", "")
        raw_timeout = opts.timeout if opts.timeout != 30.0 else os.getenv("GATEWAY_TIMEOUT", "30")
        timeout = float(raw_timeout)
        raw_retries = (
            opts.max_retries if opts.max_retries != 3 else os.getenv("GATEWAY_MAX_RETRIES", "3")
        )
        max_retries = int(raw_retries)

        self._transport = Transport(base_url, api_key, timeout, max_retries, opts.headers)

    async def is_healthy(self) -> bool:
        try:
            result = await self.health()
            return result.status == "healthy"
        except Exception:
            return False

    async def is_safe(self, input: str) -> bool:
        result = await self.scan(input)
        return result.verdict == "allow"

    async def health(self) -> GatewayHealth:
        data: dict[str, Any] = await self._transport.health_request()
        return from_dict(GatewayHealth, data)

    async def scan(self, input: str | ScanRequest) -> ScanResult:
        if isinstance(input, str):
            body: dict[str, Any] = {"input": input}
        else:
            body = _dataclass_to_dict(input)
        data: dict[str, Any] = await self._transport.request("POST", "/v1/scan", body=body)
        return from_dict(ScanResult, data)

    async def cq_scan(self, input: str, response: str) -> CqScanResult:
        data: dict[str, Any] = await self._transport.request(
            "POST", "/v1/cq_scan", body={"input": input, "response": response}
        )
        return from_dict(CqScanResult, data)

    async def chat(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        body = _dataclass_to_dict(request)
        body.pop("stream", None)
        data: dict[str, Any] = await self._transport.request(
            "POST", "/v1/chat/completions", body=body
        )
        return from_dict(ChatCompletionResponse, data)

    async def chat_stream(
        self, request: ChatCompletionRequest
    ) -> AsyncIterator[ChatCompletionChunk]:
        body = _dataclass_to_dict(request)
        body["stream"] = True
        async for chunk_dict in self._transport.stream_request("/v1/chat/completions", body):
            yield from_dict(ChatCompletionChunk, chunk_dict)

    async def embed(
        self, input: str | list[str], model: str | None = None
    ) -> EmbeddingResult:
        body: dict[str, Any] = {
            "input": input,
            "model": model or "text-embedding-3-small",
        }
        data: dict[str, Any] = await self._transport.request("POST", "/v1/embeddings", body=body)
        return from_dict(EmbeddingResult, data)

    async def moderate(
        self, input: str | list[str], model: str | None = None
    ) -> ModerationResult:
        body: dict[str, Any] = {
            "input": input,
            "model": model or "c6-guardrails-moderation",
        }
        data: dict[str, Any] = await self._transport.request("POST", "/v1/moderations", body=body)
        return from_dict(ModerationResult, data)

    async def close(self) -> None:
        await self._transport.close()

    async def __aenter__(self) -> "GatewayClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()
