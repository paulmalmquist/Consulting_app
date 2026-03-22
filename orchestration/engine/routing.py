from __future__ import annotations

import os
from typing import Any


PROTECTED_BRANCHES = {"main", "master", "production"}


def resolve_model_alias(model: str, rules: dict[str, Any]) -> str:
    aliases: dict[str, str] = rules.get("model_alias_env", {})
    if model in aliases:
        env_key = aliases[model]
        value = (os.getenv(env_key) or "").strip()
        if not value:
            raise ValueError(f"Missing required environment variable: {env_key}")
        return value
    return model


def validate_model_for_intent(intent: str, model_alias: str, taxonomy: dict[str, Any]) -> None:
    if intent not in taxonomy:
        raise ValueError(f"Unknown intent: {intent}")
    allowed = taxonomy[intent]["allowed_models"]
    if model_alias not in allowed and not (model_alias not in {"fast", "deep"} and any(a in ["fast", "deep"] for a in allowed)):
        raise ValueError(f"Model '{model_alias}' is not allowed for intent '{intent}'")


def validate_branch_not_protected(branch: str) -> None:
    if branch in PROTECTED_BRANCHES:
        raise ValueError(f"Protected branch blocked: {branch}")
