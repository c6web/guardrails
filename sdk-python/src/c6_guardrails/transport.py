import asyncio
import json
import random
import types
import typing
from collections.abc import AsyncIterator
from dataclasses import fields, is_dataclass
from typing import Any, TypeVar

import httpx

from ._version import __version__
from .errors import (
    AuthenticationError,
    FirewallBlockError,
    GatewayError,
    GatewayUnavailableError,
    RateLimitError,
)

T = TypeVar("T")


def from_dict(cls: type[T], data: dict[str, Any]) -> T:
    if not is_dataclass(cls):
        return data  # type: ignore
    kwargs: dict[str, Any] = {}
    for f in fields(cls):
        key = f.name
        json_key = key.replace("_", "/")
        raw = data.get(json_key, data.get(key))
        if raw is None and key not in data and json_key not in data:
            continue
        value = raw
        ftype = f.type
        origin = typing.get_origin(ftype)
        if origin is not None:
            if origin is list:
                args = typing.get_args(ftype)
                if args and isinstance(args[0], type) and is_dataclass(args[0]):
                    kwargs[key] = (
                        [from_dict(args[0], item) for item in value]
                        if isinstance(value, list) else value
                    )
                else:
                    kwargs[key] = value
            elif origin is typing.Union or origin is types.UnionType:
                for arg in typing.get_args(ftype):
                    if isinstance(arg, type) and is_dataclass(arg) and isinstance(value, dict):
                        kwargs[key] = from_dict(arg, value)
                        break
                else:
                    kwargs[key] = value
            elif isinstance(origin, type) and is_dataclass(origin):
                kwargs[key] = from_dict(origin, value) if isinstance(value, dict) else value
            else:
                kwargs[key] = value
        elif isinstance(ftype, type) and is_dataclass(ftype):
            kwargs[key] = from_dict(ftype, value) if isinstance(value, dict) else value
        else:
            kwargs[key] = value
    return cls(**kwargs)


class Transport:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float,
        max_retries: int,
        headers: dict[str, str],
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._max_retries = max_retries
        self._headers = {
            "User-Agent": f"c6-guardrails-python/{__version__}",
            **headers,
        }
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(self._timeout))
        return self._client

    def _auth_headers(self, include_auth: bool = True) -> dict[str, str]:
        hdrs = dict(self._headers)
        if include_auth and self._api_key:
            hdrs["Authorization"] = f"Bearer {self._api_key}"
        return hdrs

    async def request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        include_auth: bool = True,
        result_cls: type[T] | None = None,
    ) -> T:
        url = f"{self._base_url}{path}"
        headers = self._auth_headers(include_auth)
        if body is not None:
            headers.setdefault("Content-Type", "application/json")

        last_exc: Exception | None = None
        for attempt in range(self._max_retries + 1):
            try:
                client = await self._get_client()
                resp = await client.request(method, url, json=body, headers=headers)
                return await self._handle_response(resp, result_cls)
            except httpx.TimeoutException as e:
                last_exc = GatewayUnavailableError(f"Request timed out: {e}")
            except (httpx.ConnectError, httpx.RemoteProtocolError) as e:
                last_exc = GatewayUnavailableError(f"Connection failed: {e}")
            except (AuthenticationError, FirewallBlockError, RateLimitError):
                raise
            except GatewayError:
                if attempt >= self._max_retries:
                    raise
                last_exc = None
            except Exception as e:
                last_exc = e

            if attempt < self._max_retries:
                delay = min(1.0 * (2**attempt) + random.random() * 0.5, 10.0)
                await asyncio.sleep(delay)

        if last_exc:
            raise last_exc
        raise GatewayUnavailableError("Request failed after retries")

    async def _handle_response(self, resp: httpx.Response, result_cls: type[T] | None = None) -> T:
        if resp.is_success:
            data = resp.json()
            if result_cls is not None:
                return from_dict(result_cls, data)
            return data  # type: ignore

        try:
            error_data = resp.json()
        except Exception:
            error_data = {}

        err = error_data.get("error", {})
        err_is_dict = isinstance(err, dict)
        if err_is_dict:
            msg = err.get("message", "") or error_data.get("error", "") or resp.text
            code = err.get("code") or error_data.get("code")
            request_id = err.get("request_id") or error_data.get("request_id")
            hint = err.get("hint")
        else:
            msg = str(err) if err else (error_data.get("error", "") or resp.text)
            code = error_data.get("code")
            request_id = error_data.get("request_id")
            hint = None

        if resp.status_code == 401:
            raise AuthenticationError(msg or "Invalid API key")
        if resp.status_code == 403:
            blocked_stage = err.get("blocked_stage") if err_is_dict else None
            raise FirewallBlockError(
                msg or "Blocked by firewall",
                code=code,
                request_id=request_id,
                hint=hint,
                blocked_stage=blocked_stage,
            )
        if resp.status_code == 429:
            retry_after = int(resp.headers.get("retry-after", 60))
            raise RateLimitError(
                msg or "Rate limited",
                retry_after=retry_after,
                code=code,
                request_id=request_id,
            )
        if resp.status_code >= 500:
            raise GatewayUnavailableError(msg or "Gateway unavailable", status=resp.status_code)

        raise GatewayError(
            msg or "Gateway error",
            status=resp.status_code,
            code=code,
            request_id=request_id,
            hint=hint,
        )

    async def stream_request(
        self, path: str, body: dict[str, Any]
    ) -> AsyncIterator[dict[str, Any]]:
        url = f"{self._base_url}{path}"
        headers = {
            **self._auth_headers(include_auth=True),
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }

        client = await self._get_client()
        async with client.stream("POST", url, json=body, headers=headers) as resp:
            if not resp.is_success:
                await resp.aread()
                try:
                    error_data = resp.json()
                except Exception:
                    error_data = {}
                err = error_data.get("error", {})
                err_is_dict = isinstance(err, dict)
                if err_is_dict:
                    msg = err.get("message", "") or resp.text
                    code = err.get("code")
                    request_id = err.get("request_id")
                    hint = err.get("hint")
                else:
                    msg = str(err) if err else resp.text
                    code = None
                    request_id = None
                    hint = None
                if resp.status_code == 403:
                    blocked_stage = err.get("blocked_stage") if err_is_dict else None
                    raise FirewallBlockError(
                        msg or "Blocked",
                        code=code,
                        request_id=request_id,
                        hint=hint,
                        blocked_stage=blocked_stage,
                    )
                raise GatewayError(
                    msg,
                    status=resp.status_code,
                    code=code,
                    request_id=request_id,
                    hint=hint,
                )

            async for line in resp.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str == "[DONE]":
                    break
                try:
                    yield json.loads(data_str)
                except json.JSONDecodeError:
                    continue

    async def health_request(self) -> dict[str, Any]:
        return await self.request("GET", "/health", include_auth=False)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
