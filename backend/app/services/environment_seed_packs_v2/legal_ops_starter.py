"""Starter seed for Legal Ops Command environments.

Deterministic, idempotent. Uses the v2 pipeline cursor directly — does not
call the legal_ops service layer (which opens its own connections via
get_cursor()). Logic mirrors seed_demo_workspace() + seed_kb_demo() in
backend/app/services/legal_ops.py; keep them in sync when the source changes.

Seeds:
- 2 legal matters, 1 contract, 2 deadlines, 1 approval, 1 spend entry
- 1 litigation case, 2 law firms
- 3 regulatory items, 2 governance items
- 3 playbooks (NDA / MSA / DPA) with positions
- 12 clause library entries
- 4 approval rules
- 8 approvers
- 6 prior decisions (Legal Memory)
- 4 policy sources

All inserts use ON CONFLICT DO NOTHING so the pack is safely re-runnable.
"""

from __future__ import annotations

import json
from datetime import date, timedelta

from . import SeedResult

NAME = "legal_ops_starter"
VERSION = 1


def apply(cur, env_id: str, business_id: str, *, actor: str) -> SeedResult:
    rows: dict[str, int] = {}
    notes: list[str] = []
    today = date.today()

    # Pipeline passes "" when no business is bound to the session.
    # legal_* tables have a FK to public.business and require a real UUID.
    # Fall back to the production Novendor Workspace business, then any active business.
    if not business_id:
        cur.execute(
            "SELECT business_id::text FROM public.business "
            "WHERE slug = 'novendor-62cfd59c' AND is_active = true LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            cur.execute(
                "SELECT business_id::text FROM public.business WHERE is_active = true LIMIT 1"
            )
            row = cur.fetchone()
        if row:
            business_id = row["business_id"]
            notes.append(f"business_id resolved from public.business: {business_id}")
        else:
            notes.append("no active business found; seed skipped")
            return SeedResult(
                pack_name=NAME, pack_version=VERSION,
                rows_created={}, notes=notes,
            )

    # ── Matter A: high-risk acquisition ─────────────────────────────────────
    cur.execute(
        """
        INSERT INTO legal_matters
          (env_id, business_id, matter_number, title, matter_type,
           counterparty, outside_counsel, internal_owner, risk_level,
           budget_amount, status, created_by, updated_by)
        VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT DO NOTHING
        RETURNING matter_id
        """,
        (env_id, business_id, "LEG-2001", "Main Street Acquisition PSA", "Acquisition",
         "Cedar Holdings", "Foster & Bell LLP", "General Counsel", "high",
         240000, "open", actor, actor),
    )
    row = cur.fetchone()
    mid_a = row["matter_id"] if row else None

    if mid_a:
        # Contract on matter A
        cur.execute(
            """
            INSERT INTO legal_contracts
              (env_id, business_id, matter_id, contract_ref, contract_type,
               counterparty_name, effective_date, governing_law, auto_renew, status,
               created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (env_id, business_id, str(mid_a), "PSA-2026-014", "PSA", "Cedar Holdings",
             today, "NY", False, "negotiation", actor, actor),
        )

        # Deadline on matter A
        cur.execute(
            """
            INSERT INTO legal_deadlines
              (env_id, business_id, matter_id, deadline_type, due_date, status,
               created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (env_id, business_id, str(mid_a), "Closing", today + timedelta(days=30),
             "open", actor, actor),
        )

        # Approval on matter A
        cur.execute(
            """
            INSERT INTO legal_approvals
              (env_id, business_id, matter_id, approval_type, approver, status,
               approved_at, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, NULL, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (env_id, business_id, str(mid_a), "Signature Authority", "CFO", "pending",
             actor, actor),
        )

        # Litigation case on matter A
        cur.execute(
            """
            INSERT INTO legal_litigation_cases
              (env_id, business_id, matter_id, jurisdiction, claims,
               exposure_estimate, reserve_amount, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (env_id, business_id, str(mid_a), "New York Supreme Court",
             "Breach of purchase agreement", 3400000, 500000, "open", actor, actor),
        )

    rows["legal_matters"] = 1 if mid_a else 0

    # ── Matter B: vendor MSA ─────────────────────────────────────────────────
    cur.execute(
        """
        INSERT INTO legal_matters
          (env_id, business_id, matter_number, title, matter_type,
           counterparty, outside_counsel, internal_owner, risk_level,
           budget_amount, status, created_by, updated_by)
        VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT DO NOTHING
        RETURNING matter_id
        """,
        (env_id, business_id, "LEG-2002", "Vendor MSA Renewal", "Vendor",
         "Prime Build Co", "In-house", "Deputy GC", "medium",
         40000, "open", actor, actor),
    )
    row = cur.fetchone()
    mid_b = row["matter_id"] if row else None

    if mid_b:
        cur.execute(
            """
            INSERT INTO legal_spend_entries
              (env_id, business_id, matter_id, outside_counsel, invoice_ref,
               amount, incurred_date, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (env_id, business_id, str(mid_b), "In-house", "INT-001",
             8500, today, actor, actor),
        )
        # Update matter B actual_spend to reflect the spend entry
        cur.execute(
            """
            UPDATE legal_matters SET actual_spend = 8500, updated_by = %s, updated_at = now()
            WHERE matter_id = %s AND env_id = %s::uuid
            """,
            (actor, str(mid_b), env_id),
        )

    rows["legal_matters"] = rows.get("legal_matters", 0) + (1 if mid_b else 0)

    # ── Law firms ────────────────────────────────────────────────────────────
    firm_count = 0
    for firm in [
        ("Foster & Bell LLP", "James Foster", "jfoster@fosterbell.com",
         ["Real Estate", "M&A"]),
        ("Marcus & Chen LLP", "Linda Chen", "lchen@marcuschen.com",
         ["Employment", "Litigation"]),
    ]:
        cur.execute(
            """
            INSERT INTO legal_law_firms
              (env_id, business_id, firm_name, primary_contact, contact_email,
               specialties, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (env_id, business_id, firm[0], firm[1], firm[2],
             firm[3], "active", actor, actor),
        )
        firm_count += 1
    rows["legal_law_firms"] = firm_count

    # ── Regulatory items ─────────────────────────────────────────────────────
    reg_count = 0
    for item in [
        ("SEC", "Form 10-K", "Annual report filing", "2026-04-15", "General Counsel"),
        ("EPA", "40 CFR 122", "Annual environmental compliance certification", "2026-03-31", "Legal Ops"),
        ("OSHA", "29 CFR 1904", "Annual injury/illness reporting (OSHA 300A)", "2026-03-02", "HR Legal"),
    ]:
        cur.execute(
            """
            INSERT INTO legal_regulatory_items
              (env_id, business_id, agency, regulation_ref, obligation_text,
               deadline, owner, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (env_id, business_id, item[0], item[1], item[2], item[3], item[4],
             "open", actor, actor),
        )
        reg_count += 1
    rows["legal_regulatory_items"] = reg_count

    # ── Governance items ─────────────────────────────────────────────────────
    gov_count = 0
    for gov in [
        ("board_meeting", "Q1 Board of Directors Meeting", "2026-04-10", "Corporate Secretary"),
        ("resolution", "Annual Shareholder Resolution — Dividend Authorization", "2026-05-01", "General Counsel"),
    ]:
        cur.execute(
            """
            INSERT INTO legal_governance_items
              (env_id, business_id, item_type, title, scheduled_date, status,
               owner, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (env_id, business_id, gov[0], gov[1], gov[2], "pending", gov[3],
             actor, actor),
        )
        gov_count += 1
    rows["legal_governance_items"] = gov_count

    # ── Approver registry ─────────────────────────────────────────────────────
    approver_count = 0
    for app_row in [
        ("General Counsel", "Jordan Pelletier", "gc@example.com",
         {"actions": ["approve", "escalate", "close"], "max_liability": "uncapped"}),
        ("Deputy General Counsel", "Marisa Allen", "deputygc@example.com",
         {"actions": ["approve", "revise", "request_info"], "max_liability": 5_000_000}),
        ("CFO", "Wen Hu", "cfo@example.com",
         {"actions": ["approve"], "scope": "financial_terms"}),
        ("Privacy Officer", "Ana Velez", "privacy@example.com",
         {"actions": ["approve", "request_info"], "scope": "data_protection"}),
        ("Legal Ops Lead", "Theo Kapur", "legalops@example.com",
         {"actions": ["request_info"], "scope": "intake_routing"}),
        ("Information Security", "Sara Quinn", "infosec@example.com",
         {"actions": ["approve", "request_info"], "scope": "infosec"}),
        ("VP Sales", "Devon Park", "vp-sales@example.com",
         {"actions": ["approve"], "scope": "commercial_terms"}),
        ("Procurement", "Lila Mehta", "procurement@example.com",
         {"actions": ["approve"], "scope": "vendor_terms"}),
    ]:
        cur.execute(
            """
            INSERT INTO legal_approver_registry
              (env_id, business_id, role_label, person_name, contact, scope_json,
               created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s::jsonb, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (env_id, business_id, app_row[0], app_row[1], app_row[2],
             json.dumps(app_row[3]), actor, actor),
        )
        approver_count += 1
    rows["legal_approver_registry"] = approver_count

    # ── Playbooks ─────────────────────────────────────────────────────────────
    playbook_ids: dict[str, object] = {}
    for pb in [
        ("Mutual NDA", "NDA", "US", "General Counsel"),
        ("SaaS MSA (Customer-Facing)", "MSA", "US", "General Counsel"),
        ("Data Processing Addendum", "DPA", "US/EU", "Privacy Officer"),
    ]:
        cur.execute(
            """
            INSERT INTO legal_playbooks
              (env_id, business_id, name, contract_type, jurisdiction, owner, status,
               created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            RETURNING playbook_id, contract_type
            """,
            (env_id, business_id, pb[0], pb[1], pb[2], pb[3], "active", actor, actor),
        )
        row = cur.fetchone()
        if row:
            playbook_ids[pb[1]] = row["playbook_id"]
    rows["legal_playbooks"] = len(playbook_ids)

    # ── Playbook positions ────────────────────────────────────────────────────
    position_count = 0

    nda_positions = [
        ("definition_of_confidential_info", "Definition of Confidential Information",
         "All non-public information disclosed by either party, marked or reasonably understood as confidential.",
         "Information identified in writing as confidential at time of disclosure.",
         "Catch-all definitions covering publicly available information.", "medium", {}),
        ("term_of_confidentiality", "Term of Confidentiality",
         "5 years from date of disclosure for general info; perpetual for trade secrets.",
         "3 years from date of disclosure.",
         "Less than 2 years for non-trade-secret info.", "medium", {}),
        ("permitted_use", "Permitted Use",
         "Solely for the purpose of evaluating or performing the contemplated transaction.",
         "Solely for the stated business purpose.",
         "Any clause permitting use beyond the stated purpose.", "high", {}),
        ("return_or_destruction", "Return or Destruction",
         "On request: return or destroy all confidential information; certify destruction in writing.",
         "Return or destroy on request.",
         "No return/destruction obligation.", "medium", {}),
        ("no_license_granted", "No License Granted",
         "No license to any IP is granted by this agreement.",
         "Implied licenses are excluded.",
         "Any explicit IP grant tied to disclosure.", "high", {}),
        ("governing_law", "Governing Law",
         "Governed by Delaware law.",
         "Governed by New York law.",
         "Foreign jurisdiction without protective carve-outs.", "medium", {}),
        ("publicity", "Publicity",
         "No public announcement of the relationship without written consent.",
         "Logo use permitted with prior written approval.",
         "Unrestricted right to publicize.", "low", {}),
    ]

    msa_positions = [
        ("liability_cap", "Limitation of Liability",
         "Liability capped at fees paid in prior 12 months.",
         "Capped at 2x fees paid in prior 12 months for direct damages.",
         "Uncapped liability for general damages.", "high",
         {"clause_key": "liability_cap", "comparator": ">", "threshold": 1000000}),
        ("indemnification", "Indemnification",
         "Mutual indemnification for IP infringement, gross negligence, and willful misconduct.",
         "Mutual indemnification for IP infringement.",
         "One-sided indemnification favoring counterparty.", "high", {}),
        ("service_levels", "Service Levels",
         "99.9% monthly uptime with service credits for breach.",
         "99.5% monthly uptime.",
         "No SLA or remedies.", "medium", {}),
        ("data_security", "Data Security",
         "SOC 2 Type II maintained; written notice of material changes.",
         "Reasonable industry-standard security.",
         "No security obligations.", "high", {}),
        ("termination_for_convenience", "Termination for Convenience",
         "Either party with 60 days written notice; pro-rated refund for unused fees.",
         "Customer may terminate with 90 days notice; no refund.",
         "No termination for convenience.", "medium", {}),
        ("audit_rights", "Audit Rights",
         "Annual audit on 30 days notice during business hours.",
         "Audit limited to SOC 2 report sharing.",
         "No audit rights or report access.", "medium", {}),
        ("assignment", "Assignment",
         "No assignment without written consent; allowed for affiliates and acquirers.",
         "Assignment allowed to acquirer in M&A.",
         "Unrestricted right to assign.", "medium", {}),
        ("payment_terms", "Payment Terms",
         "Net 30 from invoice date; 1.5%/mo late fee.",
         "Net 45.",
         "Net 90+ or no late fee provision.", "low", {}),
    ]

    dpa_positions = [
        ("subprocessors", "Subprocessors",
         "Prior written notice; opt-out right; flow-down obligations.",
         "Notice via website; flow-down obligations.",
         "No subprocessor disclosure.", "high", {}),
        ("international_transfers", "International Transfers",
         "Standard Contractual Clauses incorporated.",
         "Equivalent transfer mechanism (e.g., adequacy).",
         "No transfer mechanism named.", "high", {}),
        ("breach_notification", "Breach Notification",
         "Notice without undue delay, in any case within 48 hours.",
         "Notice within 72 hours of discovery.",
         "Notice >7 days or 'reasonable time'.", "high", {}),
        ("data_subject_rights", "Data Subject Rights Assistance",
         "Reasonable assistance with DSARs at no extra cost up to a stated volume.",
         "Reasonable assistance, time-and-materials beyond stated volume.",
         "No assistance obligation.", "medium", {}),
        ("deletion_on_termination", "Deletion on Termination",
         "Delete or return personal data within 30 days; written certification.",
         "Delete within 60 days.",
         "Retention rights without specified basis.", "medium", {}),
        ("audit_dpa", "Audit (DPA)",
         "Annual audit or third-party report (SOC 2 / ISO 27001).",
         "Third-party report sharing only.",
         "No audit or report rights.", "medium", {}),
    ]

    for contract_type, positions in [
        ("NDA", nda_positions),
        ("MSA", msa_positions),
        ("DPA", dpa_positions),
    ]:
        pb_id = playbook_ids.get(contract_type)
        if not pb_id:
            continue
        for pos in positions:
            clause_key, clause_label, preferred, fallback, deal_breaker, severity, approval_if = pos
            cur.execute(
                """
                INSERT INTO legal_playbook_positions
                  (env_id, business_id, playbook_id, clause_key, clause_label,
                   preferred_text, fallback_text, deal_breaker_text,
                   approval_required_if, severity, created_by, updated_by)
                VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s,
                        %s::jsonb, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (env_id, business_id, str(pb_id), clause_key, clause_label,
                 preferred, fallback, deal_breaker,
                 json.dumps(approval_if), severity, actor, actor),
            )
            position_count += 1
    rows["legal_playbook_positions"] = position_count

    # ── Clause library ────────────────────────────────────────────────────────
    clause_count = 0
    for clause in [
        ("liability_cap", "Limitation of Liability",
         "Each party's aggregate liability shall not exceed the fees paid by Customer to Vendor in the 12 months preceding the claim.",
         ["commercial", "risk"], "US"),
        ("indemnification", "Indemnification",
         "Each party shall defend, indemnify, and hold harmless the other from third-party claims arising out of …",
         ["risk", "ip"], "US"),
        ("confidentiality", "Confidentiality",
         "Each party shall maintain the other's Confidential Information in strict confidence …",
         ["confidentiality"], "US"),
        ("data_security", "Data Security",
         "Vendor shall maintain administrative, technical, and physical safeguards consistent with SOC 2 Type II …",
         ["security", "data"], "US"),
        ("service_levels", "Service Levels",
         "Vendor shall achieve at least 99.9% Monthly Uptime, calculated as …",
         ["sla", "operations"], "US"),
        ("termination_for_convenience", "Termination for Convenience",
         "Either party may terminate this Agreement for convenience upon sixty (60) days written notice.",
         ["termination"], "US"),
        ("governing_law", "Governing Law",
         "This Agreement shall be governed by the laws of the State of Delaware, without regard to conflict-of-laws principles.",
         ["jurisdiction"], "US"),
        ("assignment", "Assignment",
         "Neither party may assign this Agreement without the other party's prior written consent, except to an affiliate or in connection with a merger, acquisition, or sale of substantially all assets.",
         ["transfer"], "US"),
        ("publicity", "Publicity",
         "Neither party shall issue a press release or use the other party's name or logo for marketing purposes without the other party's prior written approval.",
         ["marketing"], "US"),
        ("payment_terms", "Payment Terms",
         "All undisputed invoices shall be paid net thirty (30) days from invoice date.",
         ["commercial"], "US"),
        ("audit_rights", "Audit Rights",
         "Customer may, upon 30 days written notice and not more than once per year, audit Vendor's compliance with this Agreement during normal business hours.",
         ["governance"], "US"),
        ("subprocessors", "Subprocessors",
         "Vendor shall provide Customer with prior written notice of new Subprocessors and an opportunity to object on reasonable grounds.",
         ["data", "privacy"], "US/EU"),
    ]:
        cur.execute(
            """
            INSERT INTO legal_clause_library
              (env_id, business_id, clause_key, clause_label, canonical_text,
               tags_json, jurisdiction, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s::jsonb, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (env_id, business_id, clause[0], clause[1], clause[2],
             json.dumps(clause[3]), clause[4], actor, actor),
        )
        clause_count += 1
    rows["legal_clause_library"] = clause_count

    # ── Approval rules ────────────────────────────────────────────────────────
    rule_count = 0
    for rule in [
        ("Uncapped general liability requires GC + CFO", "MSA",
         {"clause_key": "liability_cap", "match": "uncapped"},
         "General Counsel + CFO", "executive"),
        ("Liability cap above $1M requires GC", "MSA",
         {"clause_key": "liability_cap", "comparator": ">", "threshold": 1000000},
         "General Counsel", "standard"),
        ("DPA without SCCs requires Privacy Officer", "DPA",
         {"clause_key": "international_transfers", "missing": True},
         "Privacy Officer", "standard"),
        ("NDA term <2 years requires Deputy GC", "NDA",
         {"clause_key": "term_of_confidentiality", "comparator": "<", "threshold_years": 2},
         "Deputy General Counsel", "standard"),
    ]:
        cur.execute(
            """
            INSERT INTO legal_approval_rules
              (env_id, business_id, rule_name, contract_type, trigger_json,
               required_approver, escalation_level, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s::jsonb, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (env_id, business_id, rule[0], rule[1], json.dumps(rule[2]),
             rule[3], rule[4], actor, actor),
        )
        rule_count += 1
    rows["legal_approval_rules"] = rule_count

    # ── Prior decisions (Legal Memory) ────────────────────────────────────────
    decision_count = 0
    for dec in [
        ("MSA", "liability_cap",
         "Liability capped at 2x fees paid in prior 12 months",
         "Uncapped liability except for IP infringement",
         "General Counsel",
         "Acceptable when paired with carve-outs for IP, confidentiality, and willful misconduct.",
         "Foster & Bell — 2024-09 memo on liability carve-outs."),
        ("NDA", "term_of_confidentiality",
         "5 years from disclosure; perpetual for trade secrets",
         "3 years for trade secrets",
         "Deputy General Counsel",
         "Trade-secret carve-out is non-negotiable per IP committee guidance.",
         None),
        ("DPA", "subprocessors",
         "Notice via portal with 14-day opt-out window",
         "Catalog updated quarterly with no opt-out",
         "Privacy Officer",
         "Aligns with EU SCC Module 2 controller-to-processor expectations.",
         None),
        ("MSA", "termination_for_convenience",
         "Either party with 60 days notice; pro-rated refund",
         "Customer-only termination right",
         "General Counsel",
         "Mutuality is preferred for vendor relationships above $250K ARR.",
         None),
        ("MSA", "audit_rights",
         "Annual SOC 2 Type II report + remediation plan for material findings",
         "Customer on-site audit on 7-day notice",
         "Information Security",
         "On-site audit is reserved for >$1M ARR or regulated workloads.",
         None),
        ("NDA", "permitted_use",
         "Solely for the purpose of evaluating or performing the contemplated transaction",
         "Use for any business purpose of Recipient",
         "General Counsel",
         "Purpose limitation is a hard line; broad permitted use is rejected.",
         None),
    ]:
        cur.execute(
            """
            INSERT INTO legal_prior_decisions
              (env_id, business_id, contract_type, clause_key,
               accepted_text, rejected_text, decided_by, rationale,
               outside_counsel_guidance, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (env_id, business_id, dec[0], dec[1], dec[2], dec[3], dec[4],
             dec[5], dec[6], actor, actor),
        )
        decision_count += 1
    rows["legal_prior_decisions"] = decision_count

    # ── Policy sources ────────────────────────────────────────────────────────
    policy_count = 0
    for policy in [
        ("Information Security Policy", "https://example.com/security"),
        ("Privacy Policy", "https://example.com/privacy"),
        ("Vendor Risk Management Standard", "https://example.com/vendor-risk"),
        ("Code of Conduct", "https://example.com/code-of-conduct"),
    ]:
        cur.execute(
            """
            INSERT INTO legal_policy_sources
              (env_id, business_id, title, source_url, effective_from,
               created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (env_id, business_id, policy[0], policy[1], today, actor, actor),
        )
        policy_count += 1
    rows["legal_policy_sources"] = policy_count

    return SeedResult(
        pack_name=NAME,
        pack_version=VERSION,
        rows_created=rows,
        notes=notes or [
            "legal_ops_starter: 2 matters, contracts, deadlines, approvals, litigation, "
            "2 law firms, 3 regulatory items, 2 governance items, 3 playbooks, "
            "12 clauses, 4 approval rules, 8 approvers, 6 prior decisions, "
            "4 policy sources seeded.",
        ],
    )
