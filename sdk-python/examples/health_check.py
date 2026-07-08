"""Demonstrates checking the C6 Guardrails health status.

Shows:
- Retrieving full health status via client.health().
- Quick boolean check via client.is_healthy().
- Printing detailed health fields.
- Using asyncio.run().
"""

import asyncio

from c6_guardrails import GatewayClient, GatewayClientOptions


async def main() -> None:
    client = GatewayClient(GatewayClientOptions(base_url="http://localhost:8082", api_key="ak_..."))

    # Full health status
    health = await client.health()
    print(f"Status: {health.status}")
    print(f"Data DB: {health.data_db}")
    print(f"Log DB: {health.log_db}")
    print(f"Detection degraded: {health.detection_degraded}")

    # Quick boolean check
    ok = await client.is_healthy()
    print(f"Is healthy: {ok}")

    await client.close()


asyncio.run(main())
