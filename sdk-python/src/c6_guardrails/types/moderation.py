from dataclasses import dataclass, field


@dataclass
class ModerationCategoryScores:
    harassment: float = 0.0
    harassment_threatening: float = 0.0
    hate: float = 0.0
    hate_threatening: float = 0.0
    self_harm: float = 0.0
    self_harm_intent: float = 0.0
    self_harm_instructions: float = 0.0
    sexual: float = 0.0
    sexual_minors: float = 0.0
    violence: float = 0.0
    violence_graphic: float = 0.0


@dataclass
class ModerationCategories:
    harassment: bool = False
    harassment_threatening: bool = False
    hate: bool = False
    hate_threatening: bool = False
    self_harm: bool = False
    self_harm_intent: bool = False
    self_harm_instructions: bool = False
    sexual: bool = False
    sexual_minors: bool = False
    violence: bool = False
    violence_graphic: bool = False


@dataclass
class ModerationResultItem:
    flagged: bool = False
    categories: ModerationCategories = field(default_factory=ModerationCategories)
    category_scores: ModerationCategoryScores = field(default_factory=ModerationCategoryScores)


@dataclass
class ModerationResult:
    id: str = ""
    model: str = ""
    results: list[ModerationResultItem] = field(default_factory=list)


@dataclass
class ModerationRequest:
    input: str | list[str]
    model: str = "c6-guardrails-moderation"
