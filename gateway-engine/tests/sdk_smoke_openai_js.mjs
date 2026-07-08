/**
 * Phase 0 SDK Smoke Test — OpenAI Node.js SDK
 *
 * Starts a built-in mock HTTP server returning spec-valid OpenAI responses,
 * then drives the official `openai` package through text chat, streaming,
 * and tool calls.
 *
 * Usage:
 *   node sdk_smoke_openai_js.mjs                                  # built-in mock
 *   GATEWAY_URL=http://localhost:8082 node sdk_smoke_openai_js.mjs  # live gateway
 */

import http from "node:http";
import { createServer } from "node:http";
import process from "node:process";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

const CHAT_RESPONSE = {
  id: "chatcmpl-smoke-js-001",
  object: "chat.completion",
  model: "gpt-4",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hello from the mock!" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 },
};

const TOOL_CALL_RESPONSE = {
  id: "chatcmpl-tool-js-001",
  object: "chat.completion",
  model: "gpt-4",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_js_abc",
            type: "function",
            function: {
              name: "get_weather",
              arguments: '{"location":"New York"}',
            },
          },
        ],
      },
      finish_reason: "tool_calls",
    },
  ],
  usage: { prompt_tokens: 15, completion_tokens: 10, total_tokens: 25 },
};

const STREAMING_CHUNKS = [
  'data: {"id":"chatcmpl-s","object":"chat.completion.chunk","model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"}}]}\n\n',
  'data: {"id":"chatcmpl-s","object":"chat.completion.chunk","model":"gpt-4","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
  'data: {"id":"chatcmpl-s","object":"chat.completion.chunk","model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
  "data: [DONE]\n\n",
];

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

        if (req.method === "POST" && req.url.startsWith("/v1/chat/completions")) {
          if (payload.stream) {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
            });
            for (const chunk of STREAMING_CHUNKS) {
              res.write(chunk);
            }
            res.end();
          } else if (payload.tools) {
            sendJson(res, TOOL_CALL_RESPONSE);
          } else {
            sendJson(res, CHAT_RESPONSE);
          }
        } else if (req.method === "GET" && req.url.startsWith("/v1/models")) {
          sendJson(res, { object: "list", data: [{ id: "gpt-4", object: "model" }] });
        } else {
          sendJson(res, { error: { type: "invalid_request_error", message: "not found" } }, 404);
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
  const client = new OpenAI({ apiKey: "sk-test", baseURL });

  await test("text chat", async () => {
    const resp = await client.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: "Say hi" }],
    });
    if (resp.choices[0].message.content !== "Hello from the mock!") {
      throw new Error(`unexpected content: ${resp.choices[0].message.content}`);
    }
    if (resp.choices[0].finish_reason !== "stop") {
      throw new Error(`unexpected finish_reason: ${resp.choices[0].finish_reason}`);
    }
    if (resp.usage.total_tokens !== 11) {
      throw new Error(`unexpected total_tokens: ${resp.usage.total_tokens}`);
    }
  });

  await test("streaming", async () => {
    const stream = await client.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: "Say hi" }],
      stream: true,
    });
    let content = "";
    for await (const chunk of stream) {
      content += chunk.choices?.[0]?.delta?.content ?? "";
    }
    if (content !== "Hello world") {
      throw new Error(`expected "Hello world", got: ${JSON.stringify(content)}`);
    }
  });

  await test("tool calls", async () => {
    const resp = await client.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: "What's the weather in NYC?" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get current weather",
            parameters: {
              type: "object",
              properties: { location: { type: "string" } },
              required: ["location"],
            },
          },
        },
      ],
    });
    if (resp.choices[0].finish_reason !== "tool_calls") {
      throw new Error(`expected tool_calls finish_reason`);
    }
    const tc = resp.choices[0].message.tool_calls?.[0];
    if (tc?.function?.name !== "get_weather") {
      throw new Error(`unexpected tool name: ${tc?.function?.name}`);
    }
    const args = JSON.parse(tc.function.arguments);
    if (args.location !== "New York") {
      throw new Error(`unexpected location: ${args.location}`);
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
    // OpenAI SDK does not add /v1 on its own; the full versioned base is required.
    baseURL = gatewayUrl.replace(/\/$/, "") + "/v1/";
    console.log(`OpenAI JS SDK smoke — live gateway: ${gatewayUrl}`);
  } else {
    const mock = await startMock();
    server = mock.server;
    baseURL = `http://127.0.0.1:${mock.port}/v1/`;
    console.log(`OpenAI JS SDK smoke — built-in mock: ${baseURL}`);
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
