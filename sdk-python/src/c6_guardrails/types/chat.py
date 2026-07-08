from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass
class ChatMessage:
    role: Literal["system", "user", "assistant", "tool"]
    content: str
    name: str | None = None
    tool_call_id: str | None = None


@dataclass
class ChatCompletionRequest:
    model: str
    messages: list[ChatMessage]
    stream: bool | None = None
    max_tokens: int | None = None
    temperature: float | None = None
    top_p: float | None = None
    frequency_penalty: float | None = None
    presence_penalty: float | None = None
    stop: str | list[str] | None = None
    user: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ChatCompletionChoice:
    index: int = 0
    message: ChatMessage | None = None
    finish_reason: str | None = None


@dataclass
class ChatCompletionUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass
class ChatCompletionResponse:
    id: str = ""
    object: str = ""  # "chat.completion"
    created: int = 0
    model: str = ""
    choices: list[ChatCompletionChoice] = field(default_factory=list)
    usage: ChatCompletionUsage | None = None


@dataclass
class ChatCompletionChunkChoice:
    index: int = 0
    delta: dict[str, Any] = field(default_factory=dict)
    finish_reason: str | None = None


@dataclass
class ChatCompletionChunk:
    id: str = ""
    object: str = ""  # "chat.completion.chunk"
    created: int = 0
    model: str = ""
    choices: list[ChatCompletionChunkChoice] = field(default_factory=list)
