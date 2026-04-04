from __future__ import annotations

from copy import deepcopy
from typing import Any


SAFE_AUTO_MUTATIONS = ("terse", "executive_tone", "sloppy_tone", "data_source")


def _replace_case_insensitive(message: str, needle: str, replacement: str) -> str:
    lower = message.lower()
    idx = lower.find(needle.lower())
    if idx == -1:
        return message
    return message[:idx] + replacement + message[idx + len(needle):]


def mutate_message(message: str, mutation: str, scenario: dict[str, Any]) -> str:
    stripped = " ".join(message.strip().split())
    lower = stripped.lower()
    if mutation == "terse":
        if "what am i looking at" in lower:
            return "what's this?"
        if "what fund is this" in lower:
            return "which fund is this?"
        return stripped.rstrip("?!.")
    if mutation == "verbose":
        return f"Could you walk me through this in a bit more detail: {stripped}"
    if mutation == "executive_tone":
        return f"Executive answer only: {stripped}"
    if mutation == "source_request":
        return f"{stripped.rstrip('?')}. What data is this based on?"
    if mutation == "ambiguity":
        return f"Can you handle this one for me: {stripped}"
    if mutation == "impossible":
        return f"{stripped.rstrip('?')}. Include anything missing even if the system does not show it."
    if mutation == "write_instead_of_read":
        return "Update this record for me."
    if mutation == "sloppy_tone":
        return f"uhh hey can you just tell me like {stripped.lower()}"
    if mutation == "fragmented_sentence":
        return stripped.replace("?", ".").replace(" on ", ". ").replace(" the ", " ").split(".")[0] + "?"
    if mutation == "pronoun_heavy":
        return stripped.replace("this asset", "this").replace("this fund", "this").replace("deal called", "that thing called")
    if mutation == "passive_voice":
        return f"Can it be explained why {stripped.rstrip('?').lower()}?"
    if mutation == "imperative":
        return stripped.rstrip("?!.")
    if mutation == "remove_entity_name":
        for entity in scenario.get("selected_entities", []):
            name = entity.get("name")
            if name:
                return _replace_case_insensitive(stripped, name, "this")
        return stripped
    if mutation == "deictic_this":
        return stripped.replace("the fund", "this").replace("this fund", "this")
    if mutation == "swap_environment_reference":
        return f"{stripped} I'm talking about Novendor, not this environment."
    if mutation == "stale_context_hint":
        return f"Continue from the last environment and answer this: {stripped}"
    if mutation == "indirect_other_env":
        return f"{stripped} Not the Meridian thing, the other workspace."
    if mutation == "write_request":
        return "Update this record for me."
    if mutation == "justification":
        return f"{stripped.rstrip('?')}. Why did you answer that?"
    if mutation == "data_source":
        return f"{stripped.rstrip('?')}. What data is this based on?"
    if mutation == "continue_prior_context":
        return f"Continue where we left off and {stripped[0].lower() + stripped[1:]}"
    if mutation == "impossible_missing_data":
        return f"{stripped.rstrip('?')}. Use whatever missing data you need."
    return stripped


def default_mutation_overrides(mutation: str, scenario: dict[str, Any]) -> dict[str, Any]:
    expected = deepcopy(scenario.get("expected", {}))
    if mutation in {"executive_tone", "sloppy_tone", "verbose", "fragmented_sentence", "pronoun_heavy", "passive_voice", "imperative"}:
        return expected
    if mutation == "source_request":
        mutation = "data_source"
    if mutation == "write_instead_of_read":
        mutation = "write_request"
    if mutation == "ambiguity":
        expected["status"] = "degraded"
        expected["degraded_reason"] = "ambiguous_context"
        expected.setdefault("answer_must_include", [])
        expected["answer_must_include"] = list(dict.fromkeys(expected["answer_must_include"] + ["ambiguous", "context"]))
        return expected
    if mutation == "impossible":
        expected.setdefault("answer_must_not_include", [])
        expected["answer_must_not_include"] = list(dict.fromkeys(expected["answer_must_not_include"] + ["made up", "invented"]))
        return expected
    if mutation == "data_source":
        expected.setdefault("answer_must_include", [])
        expected["answer_must_include"] = list(dict.fromkeys(expected["answer_must_include"] + ["data", "context", "based on"]))
        return expected
    if mutation == "justification":
        expected.setdefault("answer_must_include", [])
        expected["answer_must_include"] = list(dict.fromkeys(expected["answer_must_include"] + ["because", "context"]))
        return expected
    if mutation == "write_request":
        expected["allowed_lanes"] = ["C_ANALYSIS", "D_DEEP"]
        expected["allowed_skills"] = ["create_entity"]
        expected.setdefault("answer_must_include", [])
        expected["answer_must_include"] = list(dict.fromkeys(expected["answer_must_include"] + ["confirm", "proceed"]))
        return expected
    if mutation in {"swap_environment_reference", "indirect_other_env", "stale_context_hint"}:
        expected.setdefault("answer_must_not_include", [])
        expected["answer_must_not_include"] = list(dict.fromkeys(expected["answer_must_not_include"] + ["Novendor", "Meridian", "Resume"]))
        return expected
    return expected


def should_auto_mutate(scenario: dict[str, Any]) -> bool:
    return bool(scenario.get("high_value") or scenario.get("golden"))


def expand_mutations_for_scenario(
    scenario: dict[str, Any],
    *,
    mutations_mode: str,
    mutation_limit: int | None,
) -> list[dict[str, Any]]:
    base = deepcopy(scenario)
    expanded = [base]
    if mutations_mode == "disabled":
        return expanded

    labels = list(base.get("mutations", []))
    if mutations_mode == "auto" and should_auto_mutate(base):
        for label in SAFE_AUTO_MUTATIONS:
            if label not in labels:
                labels.append(label)
    if mutation_limit is not None and mutation_limit > 0:
        labels = labels[:mutation_limit]

    overrides = base.get("mutation_expectation_overrides", {})
    for label in labels:
        clone = deepcopy(base)
        clone["id"] = f"{base['id']}__{label}"
        clone["message"] = mutate_message(base["message"], label, base)
        clone["derived_from"] = base["id"]
        clone["mutation_family"] = label
        clone["mutation_label"] = label
        clone["expected"] = default_mutation_overrides(label, base)
        if label in overrides:
            clone["expected"].update(deepcopy(overrides[label]))
        expanded.append(clone)
    return expanded
