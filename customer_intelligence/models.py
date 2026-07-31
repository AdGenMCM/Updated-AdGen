from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class CustomerEvent:
    uid: str
    event_name: str
    event_id: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    source: str = "backend"
    occurred_at: Optional[int] = None


@dataclass(frozen=True)
class Recommendation:
    key: str
    title: str
    body: str
    action_label: str
    action_path: str
    category: str
    priority: int
    reason: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ScoreResult:
    activation_score: int
    engagement_score: int
    lifecycle_stage: str
    commercial_state: str
    completed_actions: List[str] = field(default_factory=list)
