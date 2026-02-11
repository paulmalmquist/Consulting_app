#!/usr/bin/env python3
"""Seed the Supabase Postgres database with realistic demo data.

Usage:
    python -m scripts.seed          # from backend/ dir
    python backend/scripts/seed.py  # from repo root

Safe to re-run: uses INSERT ... ON CONFLICT DO NOTHING / DO UPDATE.
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from uuid import uuid4

# Allow running from repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    print("FATAL: DATABASE_URL not set", file=sys.stderr)
    sys.exit(1)


def now_utc():
    return datetime.now(timezone.utc)


def past(days=0, hours=0, minutes=0):
    return now_utc() - timedelta(days=days, hours=hours, minutes=minutes)


def seed():
    conn = psycopg.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor(row_factory=psycopg.rows.dict_row)

    try:
        print("Seeding templates...")
        seed_templates(cur)

        print("Seeding environments...")
        seed_environments(cur)

        print("Looking up departments and capabilities...")
        depts = lookup_departments(cur)
        caps = lookup_capabilities(cur)

        if not depts:
            print("WARNING: No departments found. Run the schema seed first.")
            conn.commit()
            return

        print("Seeding demo business + mappings...")
        biz_id, tenant_id = seed_demo_business(cur, depts, caps)

        print("Seeding executions...")
        seed_executions(cur, biz_id, depts, caps)

        print("Seeding documents...")
        seed_documents(cur, biz_id, tenant_id, depts)

        print("Seeding work items...")
        seed_work_items(cur, biz_id, tenant_id, depts, caps)

        print("Seeding audit events...")
        seed_audit_events(cur, biz_id, tenant_id)

        conn.commit()
        print("Seed complete.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def seed_templates(cur):
    templates = [
        {
            "key": "starter",
            "label": "Starter",
            "description": "Core business departments: CRM, Accounting, Operations, HR",
            "departments": ["crm", "accounting", "operations", "hr"],
            "capabilities": "__all__",
        },
        {
            "key": "growth",
            "label": "Growth",
            "description": "Starter + Projects and Legal",
            "departments": ["crm", "accounting", "operations", "projects", "hr", "legal"],
            "capabilities": "__all__",
        },
        {
            "key": "enterprise",
            "label": "Enterprise",
            "description": "All departments and capabilities",
            "departments": [
                "crm", "accounting", "operations", "projects",
                "it", "legal", "hr", "executive", "documents", "admin",
            ],
            "capabilities": "__all__",
        },
    ]
    for t in templates:
        cur.execute(
            """INSERT INTO app.templates (key, label, description, departments, capabilities)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (key) DO UPDATE SET
                 label = EXCLUDED.label,
                 description = EXCLUDED.description,
                 departments = EXCLUDED.departments,
                 capabilities = EXCLUDED.capabilities""",
            (t["key"], t["label"], t["description"],
             json.dumps(t["departments"]), json.dumps(t["capabilities"])),
        )


def seed_environments(cur):
    envs = [
        {"client_name": "Acme Health", "industry": "healthcare", "notes": "Demo healthcare client"},
        {"client_name": "Sterling Legal", "industry": "legal", "notes": "Demo legal client"},
    ]
    for env in envs:
        cur.execute(
            """INSERT INTO app.environments (client_name, industry, notes)
               SELECT %s, %s, %s
               WHERE NOT EXISTS (
                 SELECT 1 FROM app.environments WHERE client_name = %s
               )""",
            (env["client_name"], env["industry"], env["notes"], env["client_name"]),
        )


def lookup_departments(cur):
    cur.execute("SELECT department_id, key FROM app.departments WHERE sort_order < 999 ORDER BY sort_order")
    return {r["key"]: str(r["department_id"]) for r in cur.fetchall()}


def lookup_capabilities(cur):
    cur.execute(
        """SELECT c.capability_id, c.key, d.key as dept_key
           FROM app.capabilities c
           JOIN app.departments d ON d.department_id = c.department_id
           WHERE d.sort_order < 999
           ORDER BY c.sort_order"""
    )
    result = {}
    for r in cur.fetchall():
        result[r["key"]] = {"id": str(r["capability_id"]), "dept_key": r["dept_key"]}
    return result


def seed_demo_business(cur, depts, caps):
    # Create a demo tenant + business if not exists
    cur.execute(
        "SELECT tenant_id FROM app.tenants WHERE name = 'Demo Seed Tenant' LIMIT 1"
    )
    row = cur.fetchone()
    if row:
        tenant_id = str(row["tenant_id"])
    else:
        cur.execute(
            "INSERT INTO app.tenants (name) VALUES ('Demo Seed Tenant') RETURNING tenant_id"
        )
        tenant_id = str(cur.fetchone()["tenant_id"])

    cur.execute(
        "SELECT business_id FROM app.businesses WHERE slug = 'demo-seed-business' LIMIT 1"
    )
    row = cur.fetchone()
    if row:
        biz_id = str(row["business_id"])
    else:
        cur.execute(
            """INSERT INTO app.businesses (tenant_id, name, slug, region)
               VALUES (%s, 'Demo Seed Corp', 'demo-seed-business', 'us')
               RETURNING business_id""",
            (tenant_id,),
        )
        biz_id = str(cur.fetchone()["business_id"])

    # Enable all departments for the demo business
    for dk, did in depts.items():
        cur.execute(
            """INSERT INTO app.business_departments (business_id, department_id, enabled)
               VALUES (%s, %s, true)
               ON CONFLICT (business_id, department_id) DO UPDATE SET enabled = true""",
            (biz_id, did),
        )

    # Enable all capabilities
    for ck, info in caps.items():
        cur.execute(
            """INSERT INTO app.business_capabilities (business_id, capability_id, enabled)
               VALUES (%s, %s, true)
               ON CONFLICT (business_id, capability_id) DO UPDATE SET enabled = true""",
            (biz_id, info["id"]),
        )

    return biz_id, tenant_id


def seed_executions(cur, biz_id, depts, caps):
    statuses = ["completed", "completed", "completed", "completed", "failed",
                "completed", "completed", "running", "queued", "completed"]

    execution_data = [
        # CRM
        ("crm", "accounts", {"account_name": "Acme Corp", "industry": "Technology"}),
        ("crm", "leads", {"lead_name": "Jane Doe", "source": "Website"}),
        ("crm", "opportunities", {"deal_name": "Enterprise License", "value": 125000}),
        # Accounting
        ("accounting", "journal_entries", {"description": "Monthly depreciation", "amount": 4250.00}),
        ("accounting", "invoices", {"vendor": "DataServ LLC", "amount": 12800.00}),
        ("accounting", "payments", {"payee": "CloudHost Pro", "amount": 2400.00}),
        ("accounting", "reconciliations", {"account": "Operating Checking", "period": "2025-12"}),
        # Operations
        ("operations", "workflows", {"workflow": "Order Fulfillment", "batch": "BATCH-2025-001"}),
        ("operations", "vendor_tracker", {"vendor_name": "GlobalParts Inc", "status": "onboarding"}),
        # Projects
        ("projects", "active_projects", {"project": "ERP Migration", "phase": "Discovery"}),
        ("projects", "issues", {"issue": "Data mapping gaps", "priority": "High"}),
        # IT
        ("it", "ticket_queue", {"severity": "P2", "description": "API latency spike"}),
        ("it", "change_requests", {"system": "Production DB", "change": "Index optimization"}),
        ("it", "incidents", {"severity": "P1", "description": "Auth service outage"}),
        # Legal
        ("legal", "contracts", {"contract": "MSA-2025-042", "counterparty": "MedTech Corp"}),
        ("legal", "compliance_tests", {"regulation": "HIPAA Section 164.312", "result": "pass"}),
        # HR
        ("hr", "employees", {"employee_name": "Alex Johnson", "role": "Senior Analyst"}),
        ("hr", "recruiting", {"position": "Product Designer", "candidates": 12}),
        ("hr", "onboarding", {"employee_name": "Morgan Lee", "role": "Designer"}),
        # Executive (no executions typically, but some for demo)
        ("executive", "revenue_summary", {"period": "Q4-2025", "total_revenue": 2850000}),
    ]

    for i, (dept_key, cap_key, inputs) in enumerate(execution_data):
        dept_id = depts.get(dept_key)
        cap_info = caps.get(cap_key)
        if not dept_id or not cap_info:
            continue

        status = statuses[i % len(statuses)]
        created = past(days=20 - i, hours=i * 2)

        if status == "completed":
            outputs = {
                "message": f"Execution completed: {cap_key}",
                "processed_inputs": list(inputs.keys()),
                "result_summary": f"Successfully processed {cap_key} for {dept_key}",
            }
        elif status == "failed":
            outputs = {
                "message": f"Execution failed: {cap_key}",
                "error": "Validation failed: missing required field",
            }
        else:
            outputs = {}

        cur.execute(
            """INSERT INTO app.executions
               (business_id, department_id, capability_id, status, inputs_json, outputs_json, created_at)
               VALUES (%s, %s, %s, %s::app.execution_status, %s, %s, %s)
               ON CONFLICT DO NOTHING""",
            (biz_id, dept_id, cap_info["id"], status,
             json.dumps(inputs), json.dumps(outputs), created),
        )


def seed_documents(cur, biz_id, tenant_id, depts):
    docs = [
        ("Invoice - Acme Supplies Q4", "accounting", "/accounting/invoices/acme-q4.pdf", "application/pdf", 245_000),
        ("Expense Report - Jane Smith Dec", "accounting", "/accounting/expenses/smith-dec.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 128_000),
        ("Quality Checklist Template", "operations", "/ops/templates/quality-checklist.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 85_000),
        ("Employee Handbook v5", "hr", "/hr/policies/handbook-v5.pdf", "application/pdf", 1_200_000),
        ("MSA - MedTech Corp", "legal", "/legal/contracts/medtech-msa.pdf", "application/pdf", 520_000),
        ("ERP Migration Plan", "projects", "/projects/erp-migration/plan.pdf", "application/pdf", 380_000),
        ("IT Asset Register", "it", "/it/assets/register-2025.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 156_000),
        ("CRM Data Import Template", "crm", "/crm/templates/data-import.csv", "text/csv", 42_000),
    ]

    for title, dept_key, vpath, mime, size in docs:
        dept_id = depts.get(dept_key)
        doc_id = str(uuid4())
        ver_id = str(uuid4())
        created = past(days=10, hours=len(title) % 12)
        storage_key = f"tenant/{tenant_id}/business/{biz_id}/department/{dept_id or 'general'}/document/{doc_id}/v/{ver_id}/file"

        cur.execute(
            """INSERT INTO app.documents
               (document_id, tenant_id, business_id, department_id, domain, classification, title, virtual_path, status, created_at)
               VALUES (%s, %s, %s, %s, 'general', 'other', %s, %s, 'approved', %s)
               ON CONFLICT DO NOTHING""",
            (doc_id, tenant_id, biz_id, dept_id, title, vpath, created),
        )

        cur.execute(
            """INSERT INTO app.document_versions
               (version_id, tenant_id, document_id, version_number, state, bucket, object_key,
                original_filename, mime_type, size_bytes, content_hash, finalized_at, created_at)
               VALUES (%s, %s, %s, 1, 'available', 'documents', %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT DO NOTHING""",
            (ver_id, tenant_id, doc_id, storage_key,
             vpath.split("/")[-1], mime, size,
             f"sha256:{uuid4().hex[:64]}", created, created),
        )


def seed_work_items(cur, biz_id, tenant_id, depts, caps):
    items = [
        {
            "type": "request",
            "status": "open",
            "owner": "demo_approver",
            "priority": 2,
            "title": "Approve invoice batch for Q4 processing",
            "description": "5 invoices totaling $42,500 require approval before payment run.",
            "dept": "accounting",
            "cap": "invoices",
        },
        {
            "type": "incident",
            "status": "in_progress",
            "owner": "demo_approver",
            "priority": 1,
            "title": "API latency spike affecting document uploads",
            "description": "Upload endpoint p99 latency exceeded 5s threshold for 30 minutes.",
            "dept": "it",
            "cap": "incidents",
        },
        {
            "type": "decision",
            "status": "open",
            "owner": "demo_approver",
            "priority": 3,
            "title": "Review vendor onboarding for GlobalParts Inc",
            "description": "New vendor requires compliance check before contract execution.",
            "dept": "operations",
            "cap": "vendor_tracker",
        },
        {
            "type": "task",
            "status": "waiting",
            "owner": "demo_user",
            "priority": 4,
            "title": "Update remote work policy to reflect new state regulations",
            "description": "Three states updated employment laws effective Jan 1.",
            "dept": "hr",
            "cap": "employees",
        },
        {
            "type": "question",
            "status": "open",
            "owner": "demo_user",
            "priority": 5,
            "title": "Which compliance framework applies to the new EU client?",
            "description": "Need to determine if GDPR or sector-specific regulation applies.",
            "dept": "legal",
            "cap": "regulatory_requirements",
        },
        {
            "type": "request",
            "status": "open",
            "owner": "demo_user",
            "priority": 3,
            "title": "New CRM account setup for Enterprise client",
            "description": "Enterprise license deal requires account provisioning.",
            "dept": "crm",
            "cap": "accounts",
        },
        {
            "type": "task",
            "status": "waiting",
            "owner": "demo_approver",
            "priority": 2,
            "title": "Project milestone review - ERP Migration Phase 1",
            "description": "Phase 1 deliverables need sign-off before Phase 2 kickoff.",
            "dept": "projects",
            "cap": "milestones",
        },
    ]

    for item in items:
        dept_id = depts.get(item["dept"])
        cap_info = caps.get(item["cap"])
        cur.execute(
            """INSERT INTO app.work_items
               (tenant_id, business_id, department_id, capability_id,
                type, status, owner, priority, title, description, created_by, created_at)
               SELECT %s, %s, %s, %s,
                      %s::app.work_item_type, %s::app.work_item_status,
                      %s, %s, %s, %s, %s, %s
               WHERE NOT EXISTS (
                 SELECT 1 FROM app.work_items WHERE business_id = %s AND title = %s
               )""",
            (
                tenant_id, biz_id, dept_id,
                cap_info["id"] if cap_info else None,
                item["type"], item["status"],
                item["owner"], item["priority"],
                item["title"], item["description"],
                item["owner"], past(days=3),
                biz_id, item["title"],
            ),
        )


def seed_audit_events(cur, biz_id, tenant_id):
    events = [
        ("system", "seed_database", "bm.seed", "database", None, True, 1250),
        ("demo_approver", "create_business", "bm.create_business", "business", biz_id, True, 340),
        ("demo_approver", "apply_template", "bm.apply_template", "business", biz_id, True, 890),
        ("demo_approver", "run_execution", "bm.run_execution", "execution", None, True, 2100),
        ("demo_approver", "run_execution", "bm.run_execution", "execution", None, True, 1800),
        ("demo_approver", "run_execution", "bm.run_execution", "execution", None, False, 450),
        ("demo_user", "init_upload", "bm.init_upload", "document", None, True, 560),
        ("demo_user", "complete_upload", "bm.complete_upload", "document", None, True, 120),
        ("demo_approver", "create_work_item", "bm.create_work_item", "work_item", None, True, 210),
        ("system", "create_environment", "bm.create_environment", "environment", None, True, 1500),
    ]

    for actor, action, tool, obj_type, obj_id, success, latency in events:
        cur.execute(
            """INSERT INTO app.audit_events
               (tenant_id, business_id, actor, action, tool_name,
                object_type, object_id, success, latency_ms, created_at)
               SELECT %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
               WHERE NOT EXISTS (
                 SELECT 1 FROM app.audit_events
                 WHERE business_id = %s AND action = %s AND actor = %s AND tool_name = %s
                   AND latency_ms = %s
               )""",
            (
                tenant_id, biz_id, actor, action, tool,
                obj_type, obj_id, success, latency,
                past(days=len(action) % 10, hours=latency % 24),
                biz_id, action, actor, tool, latency,
            ),
        )


if __name__ == "__main__":
    seed()
