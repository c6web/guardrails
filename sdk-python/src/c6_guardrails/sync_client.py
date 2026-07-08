import asyncio
from typing import Any

from .client import GatewayClient, GatewayClientOptions
from .types.chat import ChatCompletionRequest, ChatCompletionResponse
from .types.cq_scan import CqScanResult
from .types.embedding import EmbeddingResult
from .types.health import GatewayHealth
from .types.moderation import ModerationResult
from .types.scan import ScanRequest, ScanResult


class SyncGatewayClient:
    def __init__(self, options: GatewayClientOptions | None = None) -> None:
        self._opts = options or GatewayClientOptions()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._client: GatewayClient | None = None
        self._started = False

    def _ensure_started(self) -> GatewayClient:
        if not self._started:
            self._loop = asyncio.new_event_loop()
            self._client = GatewayClient(self._opts)
            self._started = True
        assert self._client is not None
        return self._client

    def _run(self, coro: Any) -> Any:
        self._ensure_started()
        assert self._loop is not None
        return self._loop.run_until_complete(coro)

    def health(self) -> GatewayHealth:
        return self._run(self._ensure_started().health())  # type: ignore[no-any-return]

    def scan(self, input: str | ScanRequest) -> ScanResult:
        return self._run(self._ensure_started().scan(input))  # type: ignore[no-any-return]

    def cq_scan(self, input: str, response: str) -> CqScanResult:
        return self._run(self._ensure_started().cq_scan(input, response))  # type: ignore[no-any-return]

    def chat(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        return self._run(self._ensure_started().chat(request))  # type: ignore[no-any-return]

    def embed(self, input: str | list[str], model: str | None = None) -> EmbeddingResult:
        return self._run(self._ensure_started().embed(input, model))  # type: ignore[no-any-return]

    def moderate(self, input: str | list[str], model: str | None = None) -> ModerationResult:
        return self._run(self._ensure_started().moderate(input, model))  # type: ignore[no-any-return]

    def is_healthy(self) -> bool:
        return self._run(self._ensure_started().is_healthy())  # type: ignore[no-any-return]

    def is_safe(self, input: str) -> bool:
        return self._run(self._ensure_started().is_safe(input))  # type: ignore[no-any-return]

    def close(self) -> None:
        if self._client is not None:
            self._run(self._client.close())
        if self._loop is not None:
            self._loop.close()
            self._loop = None

    def __enter__(self) -> "SyncGatewayClient":
        self._ensure_started()
        return self

    def __exit__(self, *args: object) -> None:
        self.close()
