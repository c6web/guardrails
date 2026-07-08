from dataclasses import dataclass, field


@dataclass
class EmbeddingRequest:
    input: str | list[str]
    model: str = "text-embedding-3-small"


@dataclass
class EmbeddingData:
    object: str = ""  # "embedding"
    index: int = 0
    embedding: list[float] = field(default_factory=list)


@dataclass
class EmbeddingUsage:
    prompt_tokens: int = 0
    total_tokens: int = 0


@dataclass
class EmbeddingResult:
    object: str = ""  # "list"
    data: list[EmbeddingData] = field(default_factory=list)
    model: str = ""
    usage: EmbeddingUsage = field(default_factory=EmbeddingUsage)
