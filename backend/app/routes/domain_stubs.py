"""Stub domain routes for the new department capabilities.

These endpoints return empty/mock data and will be implemented
with real business logic as each department is built out.
"""

from uuid import UUID

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["domain-stubs"])


# ── CRM ─────────────────────────────────────────────────

@router.get("/crm/{business_id}/accounts")
def list_crm_accounts(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/crm/{business_id}/contacts")
def list_crm_contacts(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/crm/{business_id}/leads")
def list_crm_leads(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/crm/{business_id}/opportunities")
def list_crm_opportunities(business_id: UUID):
    return {"items": [], "total": 0}


# ── Accounting ──────────────────────────────────────────

@router.get("/accounting/{business_id}/chart-of-accounts")
def list_chart_of_accounts(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/accounting/{business_id}/journal-entries")
def list_journal_entries(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/accounting/{business_id}/ledger")
def list_ledger(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/accounting/{business_id}/invoices")
def list_invoices(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/accounting/{business_id}/payments")
def list_payments(business_id: UUID):
    return {"items": [], "total": 0}


# ── Projects ────────────────────────────────────────────

@router.get("/projects/{business_id}/active")
def list_active_projects(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/projects/{business_id}/issues")
def list_project_issues(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/projects/{business_id}/milestones")
def list_project_milestones(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/projects/{business_id}/change-orders")
def list_change_orders(business_id: UUID):
    return {"items": [], "total": 0}


# ── IT ──────────────────────────────────────────────────

@router.get("/it/{business_id}/tickets")
def list_tickets(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/it/{business_id}/assets")
def list_it_assets(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/it/{business_id}/change-requests")
def list_change_requests(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/it/{business_id}/incidents")
def list_incidents(business_id: UUID):
    return {"items": [], "total": 0}


# ── Legal ───────────────────────────────────────────────

@router.get("/legal/{business_id}/contracts")
def list_contracts(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/legal/{business_id}/obligations")
def list_obligations(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/legal/{business_id}/risk-register")
def list_risk_register(business_id: UUID):
    return {"items": [], "total": 0}


# ── HR ──────────────────────────────────────────────────

@router.get("/hr/{business_id}/employees")
def list_employees(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/hr/{business_id}/roles")
def list_hr_roles(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/hr/{business_id}/recruiting")
def list_recruiting(business_id: UUID):
    return {"items": [], "total": 0}


# ── Operations ──────────────────────────────────────────

@router.get("/operations/{business_id}/workflows")
def list_workflows(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/operations/{business_id}/inventory")
def list_inventory(business_id: UUID):
    return {"items": [], "total": 0}


# ── Executive ───────────────────────────────────────────

@router.get("/executive/{business_id}/summary")
def get_executive_summary(business_id: UUID):
    return {
        "revenue": {"current": 0, "previous": 0, "change_pct": 0},
        "cash_position": {"balance": 0, "runway_months": 0},
        "risks": [],
        "compliance_score": 0,
        "sla_performance": 0,
        "project_health": {"on_track": 0, "at_risk": 0, "delayed": 0},
    }


# ── Admin ───────────────────────────────────────────────

@router.get("/admin/{business_id}/users")
def list_admin_users(business_id: UUID):
    return {"items": [], "total": 0}


@router.get("/admin/{business_id}/roles")
def list_admin_roles(business_id: UUID):
    return {"items": [], "total": 0}
