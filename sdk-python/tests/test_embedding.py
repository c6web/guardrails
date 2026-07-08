import pytest

from c6_guardrails import EmbeddingResult, GatewayUnavailableError


class TestEmbedding:
    EMBEDDING_JSON = {
        "object": "list",
        "data": [{"object": "embedding", "index": 0, "embedding": [0.1, 0.2, 0.3]}],
        "model": "text-embedding-3-small",
        "usage": {"prompt_tokens": 4, "total_tokens": 4},
    }

    BATCH_JSON = {
        "object": "list",
        "data": [
            {"object": "embedding", "index": 0, "embedding": [0.1, 0.2]},
            {"object": "embedding", "index": 1, "embedding": [0.3, 0.4]},
        ],
        "model": "text-embedding-3-small",
        "usage": {"prompt_tokens": 8, "total_tokens": 8},
    }

    async def test_single_input(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/embeddings",
            method="POST",
            json=self.EMBEDDING_JSON,
            match_json={"input": "hello", "model": "text-embedding-3-small"},
            status_code=200,
        )
        result = await client.embed("hello")
        assert isinstance(result, EmbeddingResult)
        assert len(result.data) == 1
        assert result.data[0].embedding == [0.1, 0.2, 0.3]

    async def test_batch_input(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/embeddings",
            method="POST",
            json=self.BATCH_JSON,
            match_json={"input": ["a", "b"], "model": "text-embedding-3-small"},
            status_code=200,
        )
        result = await client.embed(["a", "b"])
        assert len(result.data) == 2

    async def test_custom_model(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/embeddings",
            method="POST",
            json={**self.EMBEDDING_JSON, "model": "custom-model"},
            match_json={"input": "hello", "model": "custom-model"},
            status_code=200,
        )
        result = await client.embed("hello", model="custom-model")
        assert result.model == "custom-model"

    async def test_provider_error(self, client, httpx_mock):
        client._transport._max_retries = 0
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/embeddings",
            method="POST",
            json={"error": "Upstream error"},
            status_code=502,
        )
        with pytest.raises(GatewayUnavailableError):
            await client.embed("hello")
