/**
 * Phase 0 SDK Smoke Test — Anthropic Node.js SDK
 *
 * Starts a built-in mock HTTP server returning spec-valid Anthropic Messages
 * responses, then drives the official `@anthropic-ai/sdk` package through
 * text chat, streaming, and tool_use.
 *
 * Usage:
 *   node sdk_smoke_anthropic_js.mjs
 *   GATEWAY_URL=http://localhost:8082 node sdk_smoke_anthropic_js.mjs
 */

import { createServer } from "node:http";
import process from "node:process";
import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

const MESSAGES_RESPONSE = {
  id: "msg_smoke_js_001",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "Hello from the mock!" }],
  model: "claude-sonnet-4-6",
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 8, output_tokens: 6 },
};

const TOOL_USE_RESPONSE = {
  id: "msg_tool_js_001",
  type: "message",
  role: "assistant",
  content: [
    {
      type: "tool_use",
      id: "toolu_js_abc",
      name: "get_weather",
      input: { location: "New York" },
    },
  ],
  model: "claude-sonnet-4-6",
  stop_reason: "tool_use",
  stop_sequence: null,
  usage: { input_tokens: 15, output_tokens: 10 },
};

// Anthropic SSE: message_start → content_block_start → deltas → stops
const STREAMING_BODY = [
  "event: message_start",
  'data: {"type":"message_start","message":{"id":"msg_s","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-6","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":8,"output_tokens":0}}}',
  "",
  "event: content_block_start",
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
  "",
  "event: content_block_delta",
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
  "",
  "event: content_block_delta",
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}',
  "",
  "event: content_block_stop",
  'data: {"type":"content_block_stop","index":0}',
  "",
  "event: message_delta",
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}',
  "",
  "event: message_stop",
  'data: {"type":"message_stop"}',
  "",
  "",
].join("\n");

// ---------------------------------------------------------------------------
// Mock HTTP server
// ---------------------------------------------------------------------------

function startMock() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        let payload = {};
        try {
          payload = JSON.parse(body);
        } catch {}

        if (req.method === "POST" && req.url.startsWith("/v1/messages")) {
          if (payload.stream) {
            const data = Buffer.from(STREAMING_BODY, "utf8");
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "anthropic-version": "2023-06-01",
              "Content-Length": data.length,
            });
            res.end(data);
          } else if (payload.tools) {
            sendJson(res, TOOL_USE_RESPONSE);
          } else {
            sendJson(res, MESSAGES_RESPONSE);
          }
        } else {
          sendJson(
            res,
            { type: "error", error: { type: "not_found_error", message: "not found" } },
            404
          );
        }
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ pass: true, name });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.push({ pass: false, name });
    console.log(`  FAIL  ${name}: ${err.message}`);
  }
}

async function run(baseURL) {
  const client = new Anthropic({ apiKey: "ak-test", baseURL });

  await test("text chat", async () => {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [{ role: "user", content: "Say hi" }],
    });
    if (resp.type !== "message") throw new Error(`expected type=message, got ${resp.type}`);
    if (resp.role !== "assistant") throw new Error(`expected role=assistant`);
    if (resp.content.length !== 1) throw new Error(`expected 1 content block`);
    if (resp.content[0].type !== "text") throw new Error(`expected text block`);
    if (resp.content[0].text !== "Hello from the mock!") {
      throw new Error(`unexpected text: ${resp.content[0].text}`);
    }
    if (resp.stop_reason !== "end_turn") throw new Error(`unexpected stop_reason: ${resp.stop_reason}`);
    if (resp.usage.input_tokens !== 8) throw new Error(`unexpected input_tokens: ${resp.usage.input_tokens}`);
  });

  await test("streaming", async () => {
    let collected = "";
    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [{ role: "user", content: "Say hi" }],
    });
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta"
      ) {
        collected += event.delta.text;
      }
    }
    if (collected !== "Hello world") {
      throw new Error(`expected "Hello world", got: ${JSON.stringify(collected)}`);
    }
  });

  await test("tool use", async () => {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [{ role: "user", content: "What's the weather in NYC?" }],
      tools: [
        {
          name: "get_weather",
          description: "Get current weather",
          input_schema: {
            type: "object",
            properties: { location: { type: "string" } },
            required: ["location"],
          },
        },
      ],
    });
    if (resp.stop_reason !== "tool_use") {
      throw new Error(`expected stop_reason=tool_use, got ${resp.stop_reason}`);
    }
    const toolBlock = resp.content.find((b) => b.type === "tool_use");
    if (!toolBlock) throw new Error("no tool_use block in response");
    if (toolBlock.name !== "get_weather") {
      throw new Error(`unexpected tool name: ${toolBlock.name}`);
    }
    if (toolBlock.input.location !== "New York") {
      throw new Error(`unexpected location: ${toolBlock.input.location}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  let baseURL;
  let server = null;

  const gatewayUrl = process.env.GATEWAY_URL;
  if (gatewayUrl) {
    baseURL = gatewayUrl.replace(/\/$/, "") + "/";
    console.log(`Anthropic JS SDK smoke — live gateway: ${gatewayUrl}`);
  } else {
    const mock = await startMock();
    server = mock.server;
    baseURL = `http://127.0.0.1:${mock.port}/`;
    console.log(`Anthropic JS SDK smoke — built-in mock: ${baseURL}`);
  }

  await run(baseURL);

  if (server) server.close();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
