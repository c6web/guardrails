import pytest

from c6_guardrails import AuthenticationError


class TestConvenience:
    HEALTHY_JSON = {
        "status": "healthy",
        "timestamp": "2025-01-01T00:00:00Z",
        "data_db": True,
        "log_db": True,
        "cache_loaded_at": "2025-01-01T00:00:00Z",
        "cache_next_reload_at": "2025-01-01T01:00:00Z",
        "cache_next_reload_in": "3600",
        "detection_degraded": False,
    }

    UNHEALTHY_JSON = {
        "status": "unhealthy",
        "timestamp": "2025-01-01T00:00:00Z",
        "data_db": False,
        "log_db": True,
        "cache_loaded_at": None,
        "cache_next_reload_at": None,
        "cache_next_reload_in": None,
        "detection_degraded": True,
    }

    ALLOW_JSON = {
        "object": "firewall.scan",
        "request_id": "req_001",
        "verdict": "allow",
        "final_decision": "allow",
        "duration_ms": 10.0,
    }

    BLOCK_JSON = {
        "object": "firewall.scan",
        "request_id": "req_002",
        "verdict": "block",
        "final_decision": "block",
        "blocked_stage": "input",
        "detector": "test",
        "duration_ms": 10.0,
    }

    async def test_is_healthy_true(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/health",
            method="GET",
            json=self.HEALTHY_JSON,
            status_code=200,
        )
        assert await client.is_healthy() is True

    async def test_is_healthy_false_on_error(self, client, httpx_mock):
        client._transport._max_retries = 0
        httpx_mock.add_response(
            url="http://fake-gateway:8082/health",
            method="GET",
            status_code=500,
        )
        assert await client.is_healthy() is False

    async def test_is_healthy_false_on_unhealthy(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/health",
            method="GET",
            json=self.UNHEALTHY_JSON,
            status_code=200,
        )
        assert await client.is_healthy() is False

    async def test_is_safe_allow(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/scan",
            method="POST",
            json=self.ALLOW_JSON,
            status_code=200,
        )
        assert await client.is_safe("hello") is True

    async def test_is_safe_block(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/scan",
            method="POST",
            json=self.BLOCK_JSON,
            status_code=200,
        )
        assert await client.is_safe("bad") is False

    async def test_is_safe_propagates_error(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/scan",
            method="POST",
            json={"error": "Invalid API key"},
            status_code=401,
        )
        with pytest.raises(AuthenticationError):
            await client.is_safe("test")
