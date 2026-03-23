from __future__ import annotations

import re
from dataclasses import dataclass, asdict


CRISIS_RESOURCES = [
    "Call or text 988 if you may act on thoughts of self-harm or suicide right now.",
    "If you are in immediate danger, call 911 or go to the nearest emergency room.",
    "If speaking is hard, text HOME to 741741 to reach the Crisis Text Line.",
]

_HIGH_RISK_PATTERNS = {
    "suicide": re.compile(r"\b(kill myself|end my life|suicide|suicidal|want to die|don't want to live)\b", re.I),
    "self_harm": re.compile(r"\b(cut myself|hurt myself|self harm|self-harm|overdose)\b", re.I),
    "homicide": re.compile(r"\b(kill them|hurt someone|homicide|murder someone)\b", re.I),
}

_MODERATE_RISK_PATTERNS = {
    "hopeless": re.compile(r"\b(hopeless|there is no point|can't go on|feel trapped)\b", re.I),
    "panic": re.compile(r"\b(panic attack|out of control|falling apart)\b", re.I),
    "substance": re.compile(r"\b(drinking too much|using more pills|can't stop using)\b", re.I),
}


@dataclass
class SafetyAssessment:
    risk_level: str
    crisis_detected: bool
    keywords: list[str]
    resources: list[str]
    notify_therapist: bool
    rationale: str

    def as_dict(self) -> dict:
        return asdict(self)


def assess_message_risk(message: str) -> SafetyAssessment:
    text = message.strip()
    if not text:
        return SafetyAssessment(
            risk_level="none",
            crisis_detected=False,
            keywords=[],
            resources=[],
            notify_therapist=False,
            rationale="empty_message",
        )

    high_hits = [label for label, pattern in _HIGH_RISK_PATTERNS.items() if pattern.search(text)]
    if high_hits:
        level = "crisis" if any(hit in {"suicide", "homicide"} for hit in high_hits) else "high"
        return SafetyAssessment(
            risk_level=level,
            crisis_detected=True,
            keywords=high_hits,
            resources=CRISIS_RESOURCES,
            notify_therapist=True,
            rationale="keyword_high_risk",
        )

    moderate_hits = [label for label, pattern in _MODERATE_RISK_PATTERNS.items() if pattern.search(text)]
    if moderate_hits:
        level = "high" if "substance" in moderate_hits else "moderate"
        return SafetyAssessment(
            risk_level=level,
            crisis_detected=level in {"high", "crisis"},
            keywords=moderate_hits,
            resources=CRISIS_RESOURCES if level == "high" else [],
            notify_therapist=level == "high",
            rationale="keyword_moderate_risk",
        )

    if re.search(r"\b(worried all the time|can't stop worrying|anxious|overwhelmed|down)\b", text, re.I):
        return SafetyAssessment(
            risk_level="low",
            crisis_detected=False,
            keywords=["distress"],
            resources=[],
            notify_therapist=False,
            rationale="distress_signal",
        )

    return SafetyAssessment(
        risk_level="none",
        crisis_detected=False,
        keywords=[],
        resources=[],
        notify_therapist=False,
        rationale="no_concern",
    )
