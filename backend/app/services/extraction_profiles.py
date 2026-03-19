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


# ── Structured RE extraction profiles (BUILD-07) ──────────────────────────

_T12_MULTIFAMILY_SCHEMA = {
    "type": "object",
    "required": ["property_summary", "income", "expenses", "evidence"],
    "properties": {
        "property_summary": {
            "type": "object",
            "properties": {
                "property_name": {"type": ["string", "null"]},
                "total_units": {"type": ["integer", "null"]},
                "physical_occupancy": {"type": ["number", "null"], "description": "As decimal 0-1"},
                "economic_occupancy": {"type": ["number", "null"], "description": "As decimal 0-1"},
                "avg_rent_per_unit": {"type": ["number", "null"]},
                "period_start": {"type": ["string", "null"]},
                "period_end": {"type": ["string", "null"]},
            },
        },
        "unit_mix": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "unit_type": {"type": "string"},
                    "count": {"type": "integer"},
                    "avg_sf": {"type": ["number", "null"]},
                    "avg_rent": {"type": ["number", "null"]},
                    "market_rent": {"type": ["number", "null"]},
                },
            },
        },
        "income": {
            "type": "object",
            "properties": {
                "gross_potential_rent": {"type": ["number", "null"]},
                "vacancy_loss": {"type": ["number", "null"]},
                "concessions": {"type": ["number", "null"]},
                "net_rental_income": {"type": ["number", "null"]},
                "other_income": {"type": ["number", "null"]},
                "parking_income": {"type": ["number", "null"]},
                "laundry_income": {"type": ["number", "null"]},
                "pet_income": {"type": ["number", "null"]},
                "total_income": {"type": ["number", "null"]},
            },
        },
        "expenses": {
            "type": "object",
            "properties": {
                "property_taxes": {"type": ["number", "null"]},
                "insurance": {"type": ["number", "null"]},
                "utilities": {"type": ["number", "null"]},
                "repairs_maintenance": {"type": ["number", "null"]},
                "payroll": {"type": ["number", "null"]},
                "management_fee": {"type": ["number", "null"]},
                "marketing": {"type": ["number", "null"]},
                "general_admin": {"type": ["number", "null"]},
                "total_expenses": {"type": ["number", "null"]},
            },
        },
        "noi": {"type": ["number", "null"]},
        "capex": {"type": ["number", "null"]},
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

_T12_OFFICE_SCHEMA = {
    "type": "object",
    "required": ["property_summary", "tenants", "income", "expenses", "evidence"],
    "properties": {
        "property_summary": {
            "type": "object",
            "properties": {
                "property_name": {"type": ["string", "null"]},
                "total_sf": {"type": ["number", "null"]},
                "occupancy": {"type": ["number", "null"]},
                "period_start": {"type": ["string", "null"]},
                "period_end": {"type": ["string", "null"]},
            },
        },
        "tenants": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "tenant_name": {"type": "string"},
                    "suite": {"type": ["string", "null"]},
                    "sf": {"type": ["number", "null"]},
                    "base_rent_psf": {"type": ["number", "null"]},
                    "annual_base_rent": {"type": ["number", "null"]},
                    "lease_start": {"type": ["string", "null"]},
                    "lease_expiration": {"type": ["string", "null"]},
                    "cam_psf": {"type": ["number", "null"]},
                },
            },
        },
        "income": {
            "type": "object",
            "properties": {
                "base_rental_income": {"type": ["number", "null"]},
                "cam_recoveries": {"type": ["number", "null"]},
                "parking_income": {"type": ["number", "null"]},
                "vacancy_loss": {"type": ["number", "null"]},
                "total_income": {"type": ["number", "null"]},
            },
        },
        "expenses": {
            "type": "object",
            "properties": {
                "property_taxes": {"type": ["number", "null"]},
                "insurance": {"type": ["number", "null"]},
                "utilities": {"type": ["number", "null"]},
                "repairs_maintenance": {"type": ["number", "null"]},
                "management_fee": {"type": ["number", "null"]},
                "total_expenses": {"type": ["number", "null"]},
            },
        },
        "noi": {"type": ["number", "null"]},
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

_RENT_ROLL_SCHEMA = {
    "type": "object",
    "required": ["property_summary", "units", "evidence"],
    "properties": {
        "property_summary": {
            "type": "object",
            "properties": {
                "property_name": {"type": ["string", "null"]},
                "total_units": {"type": ["integer", "null"]},
                "total_sf": {"type": ["number", "null"]},
                "occupancy": {"type": ["number", "null"]},
                "as_of_date": {"type": ["string", "null"]},
            },
        },
        "units": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "unit_id": {"type": ["string", "null"]},
                    "tenant_name": {"type": ["string", "null"]},
                    "sf": {"type": ["number", "null"]},
                    "monthly_rent": {"type": ["number", "null"]},
                    "annual_rent": {"type": ["number", "null"]},
                    "lease_start": {"type": ["string", "null"]},
                    "lease_end": {"type": ["string", "null"]},
                    "status": {"type": ["string", "null"], "description": "occupied | vacant | notice"},
                },
            },
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


def get_profile_schema(profile: str) -> dict:
    if profile == "loan_real_estate_v1":
        return LOAN_REAL_ESTATE_V1_SCHEMA
    if profile == "t12_multifamily":
        return _T12_MULTIFAMILY_SCHEMA
    if profile == "t12_office":
        return _T12_OFFICE_SCHEMA
    if profile == "rent_roll_structured":
        return _RENT_ROLL_SCHEMA
    if profile in _CRE_PROFILES:
        return _CRE_PROFILES[profile]
    raise ValueError(f"Unsupported extraction profile: {profile}")
