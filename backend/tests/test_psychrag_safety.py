from app.services.psychrag_llm import summarize_session
from app.services.psychrag_safety import assess_message_risk


def test_psychrag_detects_crisis_language():
    result = assess_message_risk("I want to end my life tonight and I have a plan.")

    assert result.risk_level == "crisis"
    assert result.crisis_detected is True
    assert result.notify_therapist is True
    assert result.resources


def test_psychrag_detects_lower_distress_without_crisis():
    result = assess_message_risk("I feel anxious and overwhelmed, but I want help sorting it out.")

    assert result.risk_level == "low"
    assert result.crisis_detected is False
    assert result.notify_therapist is False


def test_psychrag_session_summary_extracts_techniques():
    summary, techniques = summarize_session(
        [
            {"role": "user", "content": "I cannot stop worrying before work."},
            {"role": "assistant", "content": "Let's try a CBT thought record and a grounding skill."},
        ],
        "low",
    )

    assert "I cannot stop worrying before work." in summary
    assert "low" in summary
    assert "cbt" in techniques
    assert "grounding" in techniques
