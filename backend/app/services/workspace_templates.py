from __future__ import annotations


def resolve_workspace_template_key(
    *,
    workspace_template_key: str | None = None,
    industry_type: str | None = None,
    industry: str | None = None,
) -> str | None:
    explicit = (workspace_template_key or "").strip().lower()
    if explicit:
        return explicit

    candidate = ((industry_type or industry) or "").strip().lower()
    if not candidate:
        return None

    if candidate in {"pds_command", "pds"}:
        return "pds_enterprise"
    if candidate in {"repe", "real_estate", "real_estate_pe"}:
        return "repe_workspace"
    if candidate in {"credit_risk_hub", "credit"}:
        return "credit_risk_hub"
    if candidate in {"legal_ops_command", "legal", "legal_ops"}:
        return "legal_ops_command"
    if candidate in {"medical_office_backoffice", "medical"}:
        return "medical_office_backoffice"
    if candidate in {"consulting", "consulting_revenue_os"}:
        return "consulting_revenue_os"
    if candidate in {"website", "floyorker", "digital_media"}:
        return "digital_media_workspace"
    if candidate in {"ecc", "executive_command_center"}:
        return "executive_command_center"

    return "generic_workspace"
