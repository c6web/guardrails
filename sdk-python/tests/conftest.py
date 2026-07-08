import pytest

from c6_guardrails import GatewayClient, GatewayClientOptions


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for var in ("GATEWAY_URL", "GATEWAY_API_KEY", "GATEWAY_TIMEOUT", "GATEWAY_MAX_RETRIES"):
        monkeypatch.delenv(var, raising=False)


@pytest.fixture
async def client(httpx_mock):
    opts = GatewayClientOptions(
        base_url="http://fake-gateway:8082",
        api_key="ak_test123",
    )
    client = GatewayClient(opts)
    client._transport._base_url = "http://fake-gateway:8082"
    yield client
    await client.close()
