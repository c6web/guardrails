from c6_guardrails import ModerationResult


class TestModeration:
    MODERATION_JSON = {
        "id": "mod_001",
        "model": "c6-guardrails-moderation",
        "results": [
            {
                "flagged": False,
                "categories": {
                    "harassment": False,
                    "hate": False,
                    "sexual": False,
                    "violence": False,
                },
                "category_scores": {
                    "harassment": 0.01,
                    "hate": 0.02,
                    "sexual": 0.01,
                    "violence": 0.03,
                },
            }
        ],
    }

    FLAGGED_JSON = {
        "id": "mod_002",
        "model": "c6-guardrails-moderation",
        "results": [
            {
                "flagged": True,
                "categories": {
                    "harassment": True,
                    "hate": False,
                    "sexual": False,
                    "violence": False,
                },
                "category_scores": {
                    "harassment": 0.95,
                    "hate": 0.02,
                    "sexual": 0.01,
                    "violence": 0.03,
                },
            }
        ],
    }

    async def test_single_input(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/moderations",
            method="POST",
            json=self.MODERATION_JSON,
            match_json={
                "input": "good text",
                "model": "c6-guardrails-moderation",
            },
            status_code=200,
        )
        result = await client.moderate("good text")
        assert isinstance(result, ModerationResult)
        assert result.id == "mod_001"

    async def test_batch_input(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/moderations",
            method="POST",
            json={
                "id": "mod_003",
                "model": "c6-guardrails-moderation",
                "results": [{"flagged": False}, {"flagged": True}],
            },
            match_json={
                "input": ["a", "b"],
                "model": "c6-guardrails-moderation",
            },
            status_code=200,
        )
        result = await client.moderate(["a", "b"])
        assert len(result.results) == 2

    async def test_flagged_result(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/moderations",
            method="POST",
            json=self.FLAGGED_JSON,
            status_code=200,
        )
        result = await client.moderate("bad text")
        assert result.results[0].flagged is True
        assert result.results[0].categories.harassment is True

    async def test_custom_model(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/moderations",
            method="POST",
            json={**self.MODERATION_JSON, "model": "custom-mod"},
            match_json={"input": "text", "model": "custom-mod"},
            status_code=200,
        )
        result = await client.moderate("text", model="custom-mod")
        assert result.model == "custom-mod"
