"""Demonstrates content quality scanning with C6 Guardrails.

Shows:
- Evaluating a prompt and response pair for groundedness, relevance,
  and hallucination scores.
- Printing the verdict and individual score arrays.
- Using asyncio.run().
"""

import asyncio

from c6_guardrails import GatewayClient, GatewayClientOptions


async def main() -> None:
    client = GatewayClient(GatewayClientOptions(base_url="http://localhost:8082", api_key="ak_..."))

    result = await client.cq_scan(
        input="What is the capital of France?",
        response="The capital of France is Paris.",
    )

    print(f"Verdict: {result.verdict}")
    print(f"Groundedness: {result.groundedness}")
    print(f"Relevance: {result.relevance}")
    print(f"Hallucination: {result.hallucination}")
    print(f"Action: {result.action}")
    print(f"Reason: {result.reason}")

    await client.close()


asyncio.run(main())
