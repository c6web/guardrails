"""
Phase 0 SDK Smoke Test — OpenAI Python SDK

Starts a local mock server returning spec-valid OpenAI responses, then drives
the official `openai` client through text chat, streaming, and tool calls.

Validates that the response shapes the gateway produces are parseable by the
SDK without errors (guards against F-3-style spec regressions).

Modes:
  python3 sdk_smoke_openai.py                              # built-in mock
  GATEWAY_URL=http://localhost:8082 python3 sdk_smoke_openai.py  # live gateway
"""
import http.server
import json
import os
import sys
import threading

import openai

# ---------------------------------------------------------------------------
# Canned responses (mirror what the gateway returns)
# ---------------------------------------------------------------------------

CHAT_RESPONSE = {
    "id": "chatcmpl-smoke-001",
    "object": "chat.completion",
    "model": "gpt-4",
    "choices": [{
        "index": 0,
        "message": {"role": "assistant", "content": "Hello from the mock!"},
        "finish_reason": "stop",
    }],
    "usage": {"prompt_tokens": 5, "completion_tokens": 6, "total_tokens": 11},
}

TOOL_CALL_RESPONSE = {
    "id": "chatcmpl-tool-001",
    "object": "chat.completion",
    "model": "gpt-4",
    "choices": [{
        "index": 0,
        "message": {
            "role": "assistant",
            "content": None,
            "tool_calls": [{
                "id": "call_abc123",
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "arguments": '{"location": "New York"}',
                },
            }],
        },
        "finish_reason": "tool_calls",
    }],
    "usage": {"prompt_tokens": 15, "completion_tokens": 10, "total_tokens": 25},
}

# Full SSE event stream for a streaming completion
STREAMING_CHUNKS = [
    b'data: {"id":"chatcmpl-s","object":"chat.completion.chunk","model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"}}]}\n\n',
    b'data: {"id":"chatcmpl-s","object":"chat.completion.chunk","model":"gpt-4","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
    b'data: {"id":"chatcmpl-s","object":"chat.completion.chunk","model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
    b'data: [DONE]\n\n',
]


# ---------------------------------------------------------------------------
# Mock HTTP server
# ---------------------------------------------------------------------------

class MockHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress per-request logs

    def do_POST(self):
        length = int(self.headers.get("content-length", 0))
        body = self.rfile.read(length) if length else b""
        try:
            payload = json.loads(body) if body else {}
        except json.JSONDecodeError:
            payload = {}

        if self.path.startswith("/v1/chat/completions"):
            if payload.get("stream"):
                self._sse(STREAMING_CHUNKS)
            elif payload.get("tools"):
                self._json(TOOL_CALL_RESPONSE)
            else:
                self._json(CHAT_RESPONSE)
        else:
            self._json({"error": {"type": "invalid_request_error", "message": "not found"}}, 404)

    def do_GET(self):
        if self.path.startswith("/v1/models"):
            self._json({"object": "list", "data": [{"id": "gpt-4", "object": "model"}]})
        else:
            self._json({"error": "not found"}, 404)

    def _json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _sse(self, chunks):
        body = b"".join(chunks)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_mock():
    srv = http.server.HTTPServer(("127.0.0.1", 0), MockHandler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return port


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------

results: list[tuple[str, str]] = []


def test(name: str, fn):
    try:
        fn()
        results.append(("PASS", name))
        print(f"  PASS  {name}")
    except Exception as exc:
        results.append(("FAIL", name))
        print(f"  FAIL  {name}: {exc}")


def run(base_url: str):
    client = openai.OpenAI(api_key="sk-test", base_url=base_url)

    def text_chat():
        resp = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": "Say hi"}],
        )
        assert resp.choices[0].message.content == "Hello from the mock!", resp
        assert resp.choices[0].finish_reason == "stop"
        assert resp.usage.total_tokens == 11

    def streaming():
        chunks = list(client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": "Say hi"}],
            stream=True,
        ))
        assert len(chunks) >= 1, "expected at least one chunk"
        content = "".join(
            c.choices[0].delta.content
            for c in chunks
            if c.choices and c.choices[0].delta.content
        )
        assert content == "Hello world", f"got: {content!r}"

    def tool_calls():
        resp = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": "What's the weather in NYC?"}],
            tools=[{
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": "Get current weather",
                    "parameters": {
                        "type": "object",
                        "properties": {"location": {"type": "string"}},
                        "required": ["location"],
                    },
                },
            }],
        )
        assert resp.choices[0].finish_reason == "tool_calls"
        tc = resp.choices[0].message.tool_calls[0]
        assert tc.function.name == "get_weather"
        args = json.loads(tc.function.arguments)
        assert args["location"] == "New York"

    test("text chat", text_chat)
    test("streaming", streaming)
    test("tool calls", tool_calls)


def main():
    gateway_url = os.environ.get("GATEWAY_URL")
    if gateway_url:
        # OpenAI SDK does not add /v1 on its own; the full versioned base is required.
        base_url = gateway_url.rstrip("/") + "/v1/"
        print(f"OpenAI Python SDK smoke — live gateway: {gateway_url}")
    else:
        port = start_mock()
        base_url = f"http://127.0.0.1:{port}/v1/"
        print(f"OpenAI Python SDK smoke — built-in mock: {base_url}")

    run(base_url)

    passed = sum(1 for r, _ in results if r == "PASS")
    failed = sum(1 for r, _ in results if r == "FAIL")
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
