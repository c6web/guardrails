"""Demonstrates the synchronous SyncGatewayClient API.

Shows:
- Instantiating SyncGatewayClient.
- Blocking scan() and health() calls.
- Context manager usage for automatic cleanup.
"""

from c6_guardrails import GatewayClientOptions, SyncGatewayClient

with SyncGatewayClient(
    GatewayClientOptions(base_url="http://localhost:8082", api_key="ak_...")
) as client:
    result = client.scan("Hello, world!")
    print(f"Blocked: {result.blocked}")

    health = client.health()
    print(f"Health: {health.status}")
