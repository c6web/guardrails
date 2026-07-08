"""
Phase 0 SDK Smoke Test — Anthropic Python SDK

Starts a local mock server returning spec-valid Anthropic Messages responses,
then drives the official `anthropic` client through text chat, streaming,
and tool_use.

Modes:
  python3 sdk_smoke_anthropic.py
  GATEWAY_URL=http://localhost:8082 python3 sdk_smoke_anthropic.py
"""
import http.server
import json
import os
import sys
import threading

import anthropic

# ---------------------------------------------------------------------------
# Canned responses
# ---------------------------------------------------------------------------

MESSAGES_RESPONSE = {
    "id": "msg_smoke_001",
    "type": "message",
    "role": "assistant",
    "content": [{"type": "text", "text": "Hello from the mock!"}],
    "model": "claude-sonnet-4-6",
    "stop_reason": "end_turn",
    "stop_sequence": None,
    "usage": {"input_tokens": 8, "output_tokens": 6},
}

TOOL_USE_RESPONSE = {
    "id": "msg_tool_001",
    "type": "message",
    "role": "assistant",
    "content": [{
        "type": "tool_use",
        "id": "toolu_smoke_abc",
        "name": "get_weather",
        "input": {"location": "New York"},
    }],
    "model": "claude-sonnet-4-6",
    "stop_reason": "tool_use",
    "stop_sequence": None,
    "usage": {"input_tokens": 15, "output_tokens": 10},
}

# Anthropic SSE stream: message_start → content_block_start → deltas → stops
STREAMING_BODY = (
    "event: message_start\n"
    'data: {"type":"message_start","message":{"id":"msg_s","type":"message",'
    '"role":"assistant","content":[],"model":"claude-sonnet-4-6",'
    '"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":8,"output_tokens":0}}}\n'
    "\n"
    "event: content_block_start\n"
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n'
    "\n"
    "event: content_block_delta\n"
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n'
    "\n"
    "event: content_block_delta\n"
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n'
    "\n"
    "event: content_block_stop\n"
    'data: {"type":"content_block_stop","index":0}\n'
    "\n"
    "event: message_delta\n"
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},'
    '"usage":{"output_tokens":2}}\n'
    "\n"
    "event: message_stop\n"
    'data: {"type":"message_stop"}\n'
    "\n"
)


# ---------------------------------------------------------------------------
# Mock HTTP server
# ---------------------------------------------------------------------------

class MockHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_POST(self):
        length = int(self.headers.get("content-length", 0))
        body = self.rfile.read(length) if length else b""
        try:
            payload = json.loads(body) if body else {}
        except json.JSONDecodeError:
            payload = {}

        if self.path.startswith("/v1/messages"):
            if payload.get("stream"):
                self._sse(STREAMING_BODY.encode())
            elif payload.get("tools"):
                self._json(TOOL_USE_RESPONSE)
            else:
                self._json(MESSAGES_RESPONSE)
        else:
            self._json({
                "type": "error",
                "error": {"type": "not_found_error", "message": "not found"},
            }, 404)

    def _json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("anthropic-version", "2023-06-01")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _sse(self, data: bytes):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("anthropic-version", "2023-06-01")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        self.wfile.flush()


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
    client = anthropic.Anthropic(api_key="ak-test", base_url=base_url)

    def text_chat():
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=100,
            messages=[{"role": "user", "content": "Say hi"}],
        )
        assert resp.type == "message"
        assert resp.role == "assistant"
        assert len(resp.content) == 1
        assert resp.content[0].type == "text"
        assert resp.content[0].text == "Hello from the mock!"
        assert resp.stop_reason == "end_turn"
        assert resp.usage.input_tokens == 8

    def streaming():
        collected = ""
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=100,
            messages=[{"role": "user", "content": "Say hi"}],
        ) as stream:
            for text in stream.text_stream:
                collected += text
        assert collected == "Hello world", f"got: {collected!r}"

    def tool_use():
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=100,
            messages=[{"role": "user", "content": "What's the weather in NYC?"}],
            tools=[{
                "name": "get_weather",
                "description": "Get current weather",
                "input_schema": {
                    "type": "object",
                    "properties": {"location": {"type": "string"}},
                    "required": ["location"],
                },
            }],
        )
        assert resp.stop_reason == "tool_use"
        tool_block = next(b for b in resp.content if b.type == "tool_use")
        assert tool_block.name == "get_weather"
        assert tool_block.input["location"] == "New York"

    test("text chat", text_chat)
    test("streaming", streaming)
    test("tool use", tool_use)


def main():
    gateway_url = os.environ.get("GATEWAY_URL")
    if gateway_url:
        base_url = gateway_url.rstrip("/") + "/"
        print(f"Anthropic Python SDK smoke — live gateway: {gateway_url}")
    else:
        port = start_mock()
        base_url = f"http://127.0.0.1:{port}/"
        print(f"Anthropic Python SDK smoke — built-in mock: {base_url}")

    run(base_url)

    passed = sum(1 for r, _ in results if r == "PASS")
    failed = sum(1 for r, _ in results if r == "FAIL")
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
