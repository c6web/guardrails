"""Demonstrates streaming chat completions through C6 Guardrails.

Shows:
- Sending a chat completion request with streaming enabled.
- Iterating over chunks with async for and printing delta content.
- Using asyncio.run().
"""

import asyncio

from c6_guardrails import (
    ChatCompletionRequest,
    ChatMessage,
    GatewayClient,
    GatewayClientOptions,
)


async def main() -> None:
    client = GatewayClient(GatewayClientOptions(base_url="http://localhost:8082", api_key="ak_..."))

    request = ChatCompletionRequest(
        model="gpt-4o",
        messages=[ChatMessage(role="user", content="Tell me a short joke")],
    )

    async for chunk in client.chat_stream(request):
        for choice in chunk.choices:
            delta = choice.delta.get("content", "")
            if delta:
                print(delta, end="", flush=True)

    print()

    await client.close()


asyncio.run(main())
