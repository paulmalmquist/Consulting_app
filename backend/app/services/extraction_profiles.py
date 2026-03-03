from __future__ import annotations

LOAN_REAL_ESTATE_V1_SCHEMA = {
    "type": "object",
    "required": [
        "parties",
        "property",
        "loan_terms",
        "fees",
        "covenants",
        "default_rate",
        "events_of_default",
        "governing_law",
    ],
    "properties": {
        "parties": {
            "type": "object",
            "required": ["borrower", "lender", "guarantor"],
            "properties": {
                "borrower": {"type": ["string", "null"]},
                "lender": {"type": ["string", "null"]},
                "guarantor": {"type": ["string", "null"]},
            },
        },
        "property": {
            "type": "object",
            "required": ["address_or_name"],
            "properties": {"address_or_name": {"type": ["string", "null"]}},
        },
        "loan_terms": {
            "type": "object",
            "required": ["loan_amount", "interest_terms", "maturity_date", "amortization_io"],
            "properties": {
                "loan_amount": {"type": ["number", "string", "null"]},
                "interest_terms": {"type": ["string", "null"]},
                "maturity_date": {"type": ["string", "null"]},
                "amortization_io": {"type": ["string", "null"]},
            },
        },
        "fees": {"type": ["string", "null"]},
        "covenants": {
            "type": "object",
            "required": ["dscr_ltv", "cash_sweep_triggers"],
            "properties": {
                "dscr_ltv": {"type": ["string", "null"]},
                "cash_sweep_triggers": {"type": ["string", "null"]},
            },
        },
        "default_rate": {"type": ["string", "null"]},
        "events_of_default": {"type": "array", "items": {"type": "string"}},
        "governing_law": {"type": ["string", "null"]},
        "evidence": {
            "type": "object",
            "additionalProperties": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["page", "snippet"],
                    "properties": {
                        "page": {"type": "integer", "minimum": 1},
                        "snippet": {"type": "string"},
                    },
                },
            },
        },
    },
}


_CRE_GENERIC_SCHEMA = {
    "type": "object",
    "required": ["document_title", "summary", "evidence"],
    "properties": {
        "document_title": {"type": "string"},
        "summary": {
            "type": "object",
            "additionalProperties": {"type": ["string", "number", "null"]},
        },
        "evidence": {
            "type": "object",
            "additionalProperties": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["page", "snippet"],
                    "properties": {
                        "page": {"type": "integer", "minimum": 1},
                        "snippet": {"type": "string"},
                    },
                },
            },
        },
    },
}

_CRE_PROFILES = {
    "offering_memo": _CRE_GENERIC_SCHEMA,
    "rent_roll": _CRE_GENERIC_SCHEMA,
    "t12": _CRE_GENERIC_SCHEMA,
    "appraisal": _CRE_GENERIC_SCHEMA,
    "loan_agreement": _CRE_GENERIC_SCHEMA,
    "lease_abstract": _CRE_GENERIC_SCHEMA,
}


def get_profile_schema(profile: str) -> dict:
    if profile == "loan_real_estate_v1":
        return LOAN_REAL_ESTATE_V1_SCHEMA
    if profile in _CRE_PROFILES:
        return _CRE_PROFILES[profile]
    raise ValueError(f"Unsupported extraction profile: {profile}")
