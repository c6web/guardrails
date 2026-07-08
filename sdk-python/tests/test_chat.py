import pytest

from c6_guardrails import (
    ChatCompletionChunk,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
    FirewallBlockError,
)


class TestChat:
    REQUEST = ChatCompletionRequest(
        model="gpt-4",
        messages=[ChatMessage(role="user", content="hello")],
    )

    RESPONSE_JSON = {
        "id": "chatcmpl_001",
        "object": "chat.completion",
        "created": 1700000000,
        "model": "gpt-4",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "Hi there!"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }

    async def test_non_streaming(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/chat/completions",
            method="POST",
            json=self.RESPONSE_JSON,
            status_code=200,
        )
        result = await client.chat(self.REQUEST)
        assert isinstance(result, ChatCompletionResponse)
        assert result.id == "chatcmpl_001"
        assert result.choices[0].message.content == "Hi there!"

    async def test_firewall_block(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/chat/completions",
            method="POST",
            json={
                "error": {
                    "message": "Blocked by content policy",
                    "code": "content_policy",
                    "request_id": "req_blocked",
                    "blocked_stage": "input",
                }
            },
            status_code=403,
        )
        with pytest.raises(FirewallBlockError):
            await client.chat(self.REQUEST)

    async def test_streaming(self, client, httpx_mock):
        sse_body = (
            'data: {"id":"chunk_1","object":"chat.completion.chunk","created":1700000000,'
            '"model":"gpt-4","choices":[{"index":0,"delta":{"content":"Hello"},'
            '"finish_reason":null}]}\n\n'
            'data: {"id":"chunk_2","object":"chat.completion.chunk","created":1700000001,'
            '"model":"gpt-4","choices":[{"index":0,"delta":{"content":" world"},'
            '"finish_reason":null}]}\n\n'
            "data: [DONE]\n\n"
        )
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/chat/completions",
            method="POST",
            text=sse_body,
            status_code=200,
        )
        chunks = []
        async for chunk in client.chat_stream(self.REQUEST):
            chunks.append(chunk)
        assert len(chunks) == 2
        assert all(isinstance(c, ChatCompletionChunk) for c in chunks)
        assert chunks[0].choices[0].delta.get("content") == "Hello"
        assert chunks[1].choices[0].delta.get("content") == " world"

    async def test_streaming_done(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/chat/completions",
            method="POST",
            text="data: [DONE]\n\n",
            status_code=200,
        )
        chunks = []
        async for chunk in client.chat_stream(self.REQUEST):
            chunks.append(chunk)
        assert len(chunks) == 0

    async def test_streaming_firewall_block(self, client, httpx_mock):
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/chat/completions",
            method="POST",
            json={
                "error": {
                    "message": "Blocked",
                    "code": "content_policy",
                    "request_id": "req_001",
                    "blocked_stage": "input",
                }
            },
            status_code=403,
        )
        with pytest.raises(FirewallBlockError):
            async for _ in client.chat_stream(self.REQUEST):
                pass

    async def test_streaming_empty_delta(self, client, httpx_mock):
        sse_body = (
            'data: {"id":"chunk_1","object":"chat.completion.chunk","created":1700000000,'
            '"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
            "data: [DONE]\n\n"
        )
        httpx_mock.add_response(
            url="http://fake-gateway:8082/v1/chat/completions",
            method="POST",
            text=sse_body,
            status_code=200,
        )
        chunks = []
        async for chunk in client.chat_stream(self.REQUEST):
            chunks.append(chunk)
        assert len(chunks) == 1
        assert chunks[0].choices[0].delta == {}
        assert chunks[0].choices[0].finish_reason == "stop"
