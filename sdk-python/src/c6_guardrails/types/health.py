from dataclasses import dataclass
from typing import Literal


@dataclass
class GatewayHealth:
    status: Literal["healthy", "unhealthy"]
    timestamp: str
    data_db: bool
    log_db: bool
    cache_loaded_at: str | None
    cache_next_reload_at: str | None
    cache_next_reload_in: str | None
    detection_degraded: bool
