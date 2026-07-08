import pytest

from c6_guardrails import (
    AuthenticationError,
    ChatMessage,
    FirewallBlockError,
    GatewayUnavailableError,
    RateLimitError,
    ScanRequest,
)


class TestScan:
    ALLOW_JSON = {
        "object": "firewall.scan",
        "request_id": "req_001",
        "verdict": "allow",
        "final_decision": "allow",
        "blocked_stage": None,
        "detector": None,
        "framework_id": None,
        "confidence": None,
        "reason": "",
        "semantic_matches": [],
        "trace": None,
        "duration_ms": 12.5,
    }

    BLOCK_JSON = {
        "object": "firewall.scan",
        "request_id": "req_002",
        "verdict": "block",
        "final_decision": "block",
        "blocked_stage": "input",
        "detector": "prompt_injection",
        "framework_id": "owasp_llm_01",
        "confidence": 0.95,
        "reason": "Prompt injection detected",
        "semantic_matches": [],
        "trace": {
            "stages": [{"name": "keyword", "result": "block", "duration_ms": 1.0, "details": None}],
            "final_decision": "block",
        },
        "duration_ms": 15.0,
    }

    async def test_string_input(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/scan",
            method="POST",
            json=self.ALLOW_JSON,
            match_json={"input": "text"},
            status_code=200,
        )
        result = await client.scan("text")
        assert result.request_id == "req_001"

    async def test_request_object(self, client, httpx_mock):
        req = ScanRequest(messages=[ChatMessage(role="user", content="hello")])
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/scan",
            method="POST",
            json=self.ALLOW_JSON,
            match_json={"messages": [{"role": "user", "content": "hello"}]},
            status_code=200,
        )
        result = await client.scan(req)
        assert result.request_id == "req_001"

    async def test_allow_verdict(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/scan",
            method="POST",
            json=self.ALLOW_JSON,
            status_code=200,
        )
        result = await client.scan("hello")
        assert result.blocked is False
        assert result.verdict == "allow"

    async def test_block_verdict(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/scan",
            method="POST",
            json=self.BLOCK_JSON,
            status_code=200,
        )
        result = await client.scan("bad stuff")
        assert result.blocked is True
        assert result.blocked_stage == "input"
        assert result.detector == "prompt_injection"

    async def test_403_firewall_block(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/scan",
            method="POST",
            json={
                "error": {
                    "message": "Blocked by firewall",
                    "code": "content_policy",
                    "request_id": "req_blocked",
                    "blocked_stage": "input",
                }
            },
            status_code=403,
        )
        with pytest.raises(FirewallBlockError) as exc_info:
            await client.scan("bad")
        assert exc_info.value.request_id == "req_blocked"
        assert exc_info.value.blocked_stage == "input"

    async def test_401_auth_error(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/scan",
            method="POST",
            json={"error": "Invalid API key"},
            status_code=401,
        )
        with pytest.raises(AuthenticationError):
            await client.scan("test")

    async def test_429_rate_limit(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/scan",
            method="POST",
            json={"error": "Rate limited"},
            status_code=429,
            headers={"retry-after": "30"},
        )
        with pytest.raises(RateLimitError) as exc_info:
            await client.scan("test")
        assert exc_info.value.retry_after == 30

    async def test_502_with_retry(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/scan",
            method="POST",
            json={"error": "Bad gateway"},
            status_code=502,
        )
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/scan",
            method="POST",
            json=self.ALLOW_JSON,
            status_code=200,
        )
        result = await client.scan("test")
        assert result.verdict == "allow"
        requests = httpx_mock.get_requests(url="http://fake-gateway:8082/v1/scan")
        assert len(requests) == 2

    async def test_exhaust_retries(self, client, httpx_mock):
        for _ in range(4):
            httpx_mock.add_response(
                url="http://fake-gateway:8082/v1/scan",
                method="POST",
                json={"error": "Bad gateway"},
                status_code=502,
            )
        with pytest.raises(GatewayUnavailableError):
            await client.scan("test")
        requests = httpx_mock.get_requests(url="http://fake-gateway:8082/v1/scan")
        assert len(requests) == 4
