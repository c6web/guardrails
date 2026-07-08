from c6_guardrails import (
    GatewayClientOptions,
    GatewayHealth,
    ScanResult,
    SyncGatewayClient,
)


class TestSyncClient:
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

    ALLOW_JSON = {
        "object": "firewall.scan",
        "request_id": "req_001",
        "verdict": "allow",
        "final_decision": "allow",
        "duration_ms": 10.0,
    }

    def test_sync_health(self, httpx_mock):
        httpx_mock.add_response(
            url="http://localhost:8082/health",
            method="GET",
            json=self.HEALTHY_JSON,
            status_code=200,
        )
        client = SyncGatewayClient()
        result = client.health()
        assert isinstance(result, GatewayHealth)
        assert result.status == "healthy"
        client.close()

    def test_sync_scan(self, httpx_mock):
        httpx_mock.add_response(
            url="http://localhost:8082/v1/scan",
            method="POST",
            json=self.ALLOW_JSON,
            status_code=200,
        )
        client = SyncGatewayClient()
        result = client.scan("test")
        assert isinstance(result, ScanResult)
        assert result.verdict == "allow"
        client.close()

    def test_context_manager(self, httpx_mock):
        httpx_mock.add_response(
            url="http://localhost:8082/health",
            method="GET",
            json=self.HEALTHY_JSON,
            status_code=200,
        )
        opts = GatewayClientOptions(
            base_url="http://localhost:8082",
            api_key="ak_test123",
        )
        with SyncGatewayClient(opts) as c:
            result = c.health()
            assert result.status == "healthy"

    def test_closes_cleanly(self, httpx_mock):
        httpx_mock.add_response(
            url="http://localhost:8082/health",
            method="GET",
            json=self.HEALTHY_JSON,
            status_code=200,
        )
        client = SyncGatewayClient()
        client.health()
        client.close()
        assert client._loop is None
