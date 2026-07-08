import httpx

from c6_guardrails import GatewayHealth


class TestHealth:
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

    async def test_healthy_gateway(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/health",
            method="GET",
            json=self.HEALTHY_JSON,
            status_code=200,
        )
        result = await client.health()
        assert isinstance(result, GatewayHealth)
        assert result.status == "healthy"
        assert result.data_db is True
        assert result.detection_degraded is False

    async def test_unhealthy_gateway(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/health",
            method="GET",
            json=self.UNHEALTHY_JSON,
            status_code=200,
        )
        result = await client.health()
        assert result.status == "unhealthy"
        assert result.data_db is False
        assert result.detection_degraded is True

    async def test_no_auth_header(self, client, httpx_mock):
        request_sent = None

        def store_request(request: httpx.Request) -> httpx.Response:
            nonlocal request_sent
            request_sent = request
            return httpx.Response(200, json=self.HEALTHY_JSON)

        httpx_mock.add_callback(store_request, url="http://fake-gateway:8082/health", method="GET")
        await client.health()
        assert request_sent is not None
        assert "Authorization" not in request_sent.headers
