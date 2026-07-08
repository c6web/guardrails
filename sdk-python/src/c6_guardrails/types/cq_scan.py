from dataclasses import dataclass, field
from typing import Literal


@dataclass
class CqScanRequest:
    input: str
    response: str


@dataclass
class CqScanResult:
    object: str = ""  # "firewall.cq_scan"
    request_id: str = ""
    groundedness: list[float] = field(default_factory=list)
    relevance: list[float] = field(default_factory=list)
    hallucination: list[float] = field(default_factory=list)
    verdict: Literal["allow", "flag", "block"] = "allow"
    action: str = ""
    reason: str = ""
    duration_ms: float = 0.0
