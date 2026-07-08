from dataclasses import dataclass, field
from typing import Any, Literal

from .chat import ChatMessage


@dataclass
class SemanticMatch:
    id: str
    name: str
    similarity: float


@dataclass
class PipelineTraceStage:
    name: str
    result: str
    duration_ms: float
    details: Any | None = None


@dataclass
class PipelineTrace:
    stages: list[PipelineTraceStage] = field(default_factory=list)
    final_decision: str = ""


@dataclass
class ScanRequest:
    input: str | None = field(default=None)
    messages: list[ChatMessage] | None = field(default=None)
    prompt: str | None = field(default=None)
    text: str | None = field(default=None)


@dataclass
class ScanResult:
    object: str = ""  # "firewall.scan"
    request_id: str = ""
    verdict: Literal["allow", "block"] = "allow"
    final_decision: Literal["allow", "block"] = "allow"
    blocked_stage: str | None = None
    detector: str | None = None
    framework_id: str | None = None
    confidence: float | None = None
    reason: str = ""
    semantic_matches: list[SemanticMatch] = field(default_factory=list)
    trace: PipelineTrace | None = None
    duration_ms: float = 0.0

    @property
    def blocked(self) -> bool:
        return self.verdict == "block"
