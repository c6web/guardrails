from c6_guardrails import CqScanResult


class TestCqScan:
    CQ_JSON = {
        "object": "firewall.cq_scan",
        "request_id": "cq_001",
        "groundedness": [0.95, 0.87],
        "relevance": [0.90, 0.85],
        "hallucination": [0.02, 0.05],
        "verdict": "allow",
        "action": "none",
        "reason": "All good",
        "duration_ms": 45.0,
    }

    async def test_happy_path(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/cq_scan",
            method="POST",
            json=self.CQ_JSON,
            match_json={"input": "What is AI?", "response": "AI is..."},
            status_code=200,
        )
        result = await client.cq_scan("What is AI?", "AI is...")
        assert isinstance(result, CqScanResult)
        assert result.request_id == "cq_001"

    async def test_returns_scores(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/cq_scan",
            method="POST",
            json=self.CQ_JSON,
            status_code=200,
        )
        result = await client.cq_scan("prompt", "response")
        assert result.groundedness == [0.95, 0.87]
        assert result.hallucination == [0.02, 0.05]
        assert result.relevance == [0.90, 0.85]
