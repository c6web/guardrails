"""Demonstrates moderation checks through C6 Guardrails.

Shows:
- Moderating multiple text inputs.
- Printing flagged status and category scores for each result.
- Using asyncio.run().
"""

import asyncio

from c6_guardrails import GatewayClient, GatewayClientOptions


async def main() -> None:
    client = GatewayClient(GatewayClientOptions(base_url="http://localhost:8082", api_key="ak_..."))

    result = await client.moderate(
        [
            "I love programming",
            "I will hurt someone",
        ]
    )

    for i, item in enumerate(result.results):
        print(f"Input {i}:")
        print(f"  Flagged: {item.flagged}")
        print(f"  Categories: {item.categories}")
        print(f"  Scores: {item.category_scores}")

    await client.close()


asyncio.run(main())
