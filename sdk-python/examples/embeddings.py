"""Demonstrates generating embeddings through C6 Guardrails.

Shows:
- Embedding a single text string.
- Embedding a batch of texts.
- Printing embedding dimensions and first few values.
- Using asyncio.run().
"""

import asyncio

from c6_guardrails import GatewayClient, GatewayClientOptions


async def main() -> None:
    client = GatewayClient(GatewayClientOptions(base_url="http://localhost:8082", api_key="ak_..."))

    # Single text
    result = await client.embed("Hello, world!")
    print(f"Dimensions: {len(result.data[0].embedding)}")
    print(f"First 5 values: {result.data[0].embedding[:5]}")

    # Batch of texts
    result = await client.embed(["First text", "Second text", "Third text"])
    for i, data in enumerate(result.data):
        print(f"Item {i}: {len(data.embedding)} dimensions")

    await client.close()


asyncio.run(main())
