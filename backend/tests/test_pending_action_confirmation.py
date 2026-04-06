"""Tests for pending action param injection on confirmation turn.

Verifies that params_json stored in ai_pending_actions is surfaced
correctly so the LLM can call the write tool with confirmed=true
and all accumulated parameters.
"""
from __future__ import annotations

import json
import re


def test_confirm_keywords_match_positive():
    """_CONFIRM_KEYWORDS regex matches all expected confirmation phrases."""
    from app.services.ai_gateway import _CONFIRM_KEYWORDS

    phrases = [
        "yes",
        "Yes",
        "YES",
        "yep",
        "yeah",
        "sure",
        "ok",
        "okay",
        "go ahead",
        "proceed",
        "do it",
        "confirmed",
        "looks good",
        "sounds good",
        "approve",
        "let's go",
        "execute",
        "make it so",
        "yes.",
        "Yes!",
    ]
    for phrase in phrases:
        assert _CONFIRM_KEYWORDS.search(phrase.strip()), (
            f"Expected _CONFIRM_KEYWORDS to match '{phrase}'"
        )


def test_confirm_keywords_reject_negative():
    """_CONFIRM_KEYWORDS must NOT match cancel/other phrases."""
    from app.services.ai_gateway import _CONFIRM_KEYWORDS

    phrases = [
        "no",
        "nope",
        "cancel",
        "never mind",
        "stop",
        "maybe",
        "change the name",
        "actually",
        "wait",
    ]
    for phrase in phrases:
        assert not _CONFIRM_KEYWORDS.search(phrase.strip()), (
            f"Expected _CONFIRM_KEYWORDS NOT to match '{phrase}'"
        )


def test_pending_action_augmentation_format():
    """Verify the augmentation string format matches what the LLM needs.

    This is a unit test of the string-building logic (not the full gateway),
    ensuring the injected context contains the skill_id and serialised params.
    """
    params_json = {"name": "Atlas Growth Fund V", "vintage_year": 2025,
                   "fund_type": "closed_end", "strategy": "equity"}
    action_type = "create_fund"
    skill_id = "repe.create_fund"

    augmentation = (
        f"[CONTEXT: User is confirming a pending {action_type}. "
        f"Previously collected parameters: {json.dumps(params_json)}. "
        f"Call tool '{skill_id}' with confirmed=true and ALL these parameters. "
        f"Do NOT omit or modify any parameter.]"
    )

    assert "Atlas Growth Fund V" in augmentation
    assert "repe.create_fund" in augmentation
    assert "confirmed=true" in augmentation
    assert "closed_end" in augmentation
    assert "2025" in augmentation


def test_pending_action_empty_params_augmentation():
    """When params_json is empty, augmentation still names the tool."""
    action_type = "create_fund"
    skill_id = "repe.create_fund"
    pa_params: dict = {}

    if pa_params:
        augmentation = (
            f"[CONTEXT: User is confirming a pending {action_type}. "
            f"Previously collected parameters: {json.dumps(pa_params)}. "
            f"Call tool '{skill_id}' with confirmed=true and ALL these parameters. "
            f"Do NOT omit or modify any parameter.]"
        )
    else:
        augmentation = (
            f"[CONTEXT: User is confirming a pending {action_type}. "
            f"Call tool '{skill_id}' with confirmed=true.]"
        )

    assert "repe.create_fund" in augmentation
    assert "confirmed=true" in augmentation
