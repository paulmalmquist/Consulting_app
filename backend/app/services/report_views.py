"""Read-only reporting views derived from existing app + finance records."""

from __future__ import annotations

from uuid import UUID

from app.db import get_cursor


def business_overview(*, business_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT b.business_id,
                   b.name,
                   b.slug,
                   b.region,
                   b.created_at,
                   COALESCE(d.dept_count, 0) AS departments_enabled,
                   COALESCE(c.cap_count, 0) AS capabilities_enabled,
                   COALESCE(doc.doc_count, 0) AS documents_count,
                   COALESCE(exe.exec_count, 0) AS executions_count,
                   COALESCE(fund.fund_count, 0) AS funds_count
            FROM app.businesses b
            LEFT JOIN (
              SELECT business_id, COUNT(*) AS dept_count
              FROM app.business_departments
              WHERE enabled = true
              GROUP BY business_id
            ) d ON d.business_id = b.business_id
            LEFT JOIN (
              SELECT business_id, COUNT(*) AS cap_count
              FROM app.business_capabilities
              WHERE enabled = true
              GROUP BY business_id
            ) c ON c.business_id = b.business_id
            LEFT JOIN (
              SELECT business_id, COUNT(*) AS doc_count
              FROM app.documents
              GROUP BY business_id
            ) doc ON doc.business_id = b.business_id
            LEFT JOIN (
              SELECT business_id, COUNT(*) AS exec_count
              FROM app.executions
              GROUP BY business_id
            ) exe ON exe.business_id = b.business_id
            LEFT JOIN (
              SELECT business_id, COUNT(*) AS fund_count
              FROM fin_fund
              GROUP BY business_id
            ) fund ON fund.business_id = b.business_id
            WHERE b.business_id = %s
            """,
            (str(business_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Business not found")

    return {
        "business": row,
        "links": {
            "app": "/app",
            "documents": "/documents",
            "reports": "/app/reports",
            "repe": "/app/finance/repe",
        },
    }


def department_health(*, business_id: UUID, dept_key: str | None = None) -> dict:
    with get_cursor() as cur:
        params: list[str] = [str(business_id)]
        where = ""
        if dept_key:
            where = "AND d.key = %s"
            params.append(dept_key)

        cur.execute(
            f"""
            SELECT d.department_id,
                   d.key,
                   d.label,
                   bd.enabled,
                   COUNT(DISTINCT bc.capability_id) FILTER (WHERE bc.enabled) AS enabled_capabilities,
                   COUNT(DISTINCT doc.document_id) AS documents_count,
                   COUNT(DISTINCT exe.execution_id) AS executions_count,
                   MAX(exe.created_at) AS last_execution_at
            FROM app.business_departments bd
            JOIN app.departments d ON d.department_id = bd.department_id
            LEFT JOIN app.capabilities cap ON cap.department_id = d.department_id
            LEFT JOIN app.business_capabilities bc
              ON bc.capability_id = cap.capability_id
             AND bc.business_id = bd.business_id
            LEFT JOIN app.documents doc
              ON doc.business_id = bd.business_id
             AND doc.department_id = d.department_id
            LEFT JOIN app.executions exe
              ON exe.business_id = bd.business_id
             AND exe.department_id = d.department_id
            WHERE bd.business_id = %s
              AND bd.enabled = true
              {where}
            GROUP BY d.department_id, d.key, d.label, bd.enabled
            ORDER BY d.sort_order
            """,
            tuple(params),
        )
        rows = cur.fetchall()

    return {
        "rows": [
            {
                **r,
                "deep_link": f"/app/{r['key']}",
                "documents_link": f"/documents?department={r['department_id']}",
            }
            for r in rows
        ]
    }


def doc_register(*, business_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT d.document_id,
                   d.title,
                   d.status::text AS status,
                   d.created_at,
                   dep.key AS department_key,
                   COALESCE(v.version_count, 0) AS version_count,
                   v.latest_version_id,
                   v.latest_mime_type,
                   v.latest_state
            FROM app.documents d
            LEFT JOIN app.departments dep ON dep.department_id = d.department_id
            LEFT JOIN LATERAL (
              SELECT COUNT(*) AS version_count,
                     (ARRAY_AGG(version_id ORDER BY version_number DESC))[1] AS latest_version_id,
                     (ARRAY_AGG(mime_type ORDER BY version_number DESC))[1] AS latest_mime_type,
                     (ARRAY_AGG(state::text ORDER BY version_number DESC))[1] AS latest_state
              FROM app.document_versions dv
              WHERE dv.document_id = d.document_id
            ) v ON true
            WHERE d.business_id = %s
            ORDER BY d.created_at DESC
            """,
            (str(business_id),),
        )
        rows = cur.fetchall()

    return {
        "rows": [
            {
                **r,
                "deep_link": "/documents",
                "download_link": (
                    f"/api/documents/{r['document_id']}/versions/{r['latest_version_id']}/download-url"
                    if r.get("latest_version_id")
                    else None
                ),
            }
            for r in rows
        ]
    }


def doc_compliance(*, business_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT d.document_id,
                   d.title,
                   d.status::text AS status,
                   COALESCE(v.version_count, 0) AS version_count,
                   COALESCE(v.available_count, 0) AS available_versions,
                   COALESCE(acl.acl_count, 0) AS acl_entries,
                   CASE WHEN COALESCE(acl.acl_count, 0) = 0 THEN true ELSE false END AS missing_acl,
                   CASE WHEN COALESCE(v.available_count, 0) = 0 THEN true ELSE false END AS no_available_version,
                   CASE WHEN d.status::text NOT IN ('approved', 'review') THEN true ELSE false END AS status_flag
            FROM app.documents d
            LEFT JOIN LATERAL (
              SELECT COUNT(*) AS version_count,
                     COUNT(*) FILTER (WHERE state = 'available') AS available_count
              FROM app.document_versions dv
              WHERE dv.document_id = d.document_id
            ) v ON true
            LEFT JOIN LATERAL (
              SELECT COUNT(*) AS acl_count
              FROM app.document_acl da
              WHERE da.document_id = d.document_id
            ) acl ON true
            WHERE d.business_id = %s
            ORDER BY d.created_at DESC
            """,
            (str(business_id),),
        )
        rows = cur.fetchall()

    return {
        "rows": [
            {
                **r,
                "severity": "high"
                if (r["missing_acl"] or r["no_available_version"])
                else ("medium" if r["status_flag"] else "ok"),
                "deep_link": "/documents",
            }
            for r in rows
        ]
    }


def execution_ledger(*, business_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT e.execution_id,
                   e.status::text AS status,
                   e.created_at,
                   d.key AS department_key,
                   d.label AS department_label,
                   c.key AS capability_key,
                   c.label AS capability_label,
                   e.inputs_json,
                   e.outputs_json
            FROM app.executions e
            LEFT JOIN app.departments d ON d.department_id = e.department_id
            LEFT JOIN app.capabilities c ON c.capability_id = e.capability_id
            WHERE e.business_id = %s
            ORDER BY e.created_at DESC
            """,
            (str(business_id),),
        )
        rows = cur.fetchall()

    return {
        "rows": [
            {
                **r,
                "deep_link": (
                    f"/app/{r['department_key']}/capability/{r['capability_key']}"
                    if r.get("department_key") and r.get("capability_key")
                    else "/app"
                ),
            }
            for r in rows
        ]
    }


def template_adoption(*, business_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT b.business_id,
                   b.name,
                   snap.template_key,
                   snap.expected_departments,
                   snap.expected_capabilities,
                   ARRAY_REMOVE(ARRAY_AGG(DISTINCT d.key) FILTER (WHERE bd.enabled), NULL) AS current_departments,
                   ARRAY_REMOVE(ARRAY_AGG(DISTINCT c.key) FILTER (WHERE bc.enabled), NULL) AS current_capabilities
            FROM app.businesses b
            LEFT JOIN app.business_template_snapshot snap ON snap.business_id = b.business_id
            LEFT JOIN app.business_departments bd ON bd.business_id = b.business_id
            LEFT JOIN app.departments d ON d.department_id = bd.department_id
            LEFT JOIN app.business_capabilities bc ON bc.business_id = b.business_id
            LEFT JOIN app.capabilities c ON c.capability_id = bc.capability_id
            WHERE b.business_id = %s
            GROUP BY b.business_id, b.name, snap.template_key, snap.expected_departments, snap.expected_capabilities
            """,
            (str(business_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Business not found")

        expected_depts = set(row.get("expected_departments") or [])
        expected_caps = set(row.get("expected_capabilities") or [])
        current_depts = set(row.get("current_departments") or [])
        current_caps = set(row.get("current_capabilities") or [])

        missing_depts = sorted(expected_depts - current_depts)
        extra_depts = sorted(current_depts - expected_depts)
        missing_caps = sorted(expected_caps - current_caps)
        extra_caps = sorted(current_caps - expected_caps)

    return {
        "template_key": row.get("template_key"),
        "drift": {
            "has_drift": bool(missing_depts or extra_depts or missing_caps or extra_caps),
            "missing_departments": missing_depts,
            "extra_departments": extra_depts,
            "missing_capabilities": missing_caps,
            "extra_capabilities": extra_caps,
        },
        "deep_link": "/onboarding",
    }


def readiness(*, business_id: UUID) -> dict:
    overview = business_overview(business_id=business_id)
    dept = department_health(business_id=business_id)
    docs = doc_register(business_id=business_id)
    execs = execution_ledger(business_id=business_id)

    dept_rows = dept["rows"]
    healthy = [r for r in dept_rows if r["enabled_capabilities"] > 0 and r["executions_count"] > 0]

    return {
        "score": {
            "departments_configured": len(dept_rows),
            "departments_with_activity": len(healthy),
            "documents": len(docs["rows"]),
            "executions": len(execs["rows"]),
        },
        "rows": [
            {
                "area": "Department Coverage",
                "value": f"{len(healthy)}/{len(dept_rows)} active",
                "status": "ok" if len(healthy) == len(dept_rows) and len(dept_rows) > 0 else "attention",
                "deep_link": "/app",
            },
            {
                "area": "Document Register",
                "value": str(len(docs["rows"])),
                "status": "ok" if len(docs["rows"]) > 0 else "attention",
                "deep_link": "/documents",
            },
            {
                "area": "Execution Ledger",
                "value": str(len(execs["rows"])),
                "status": "ok" if len(execs["rows"]) > 0 else "attention",
                "deep_link": "/app",
            },
            {
                "area": "Business Provisioning",
                "value": overview["business"]["name"],
                "status": "ok",
                "deep_link": "/onboarding",
            },
        ],
    }


def simulate_template_drift(*, business_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """SELECT expected_capabilities
               FROM app.business_template_snapshot
               WHERE business_id = %s""",
            (str(business_id),),
        )
        snap = cur.fetchone()
        if not snap:
            raise LookupError("No template snapshot found for this business")
        expected_caps = list(snap.get("expected_capabilities") or [])
        if not expected_caps:
            raise ValueError("Template snapshot has no expected capabilities")
        cap_key = expected_caps[0]

        cur.execute(
            """UPDATE app.business_capabilities bc
               SET enabled = false
               FROM app.capabilities c
               WHERE bc.business_id = %s
                 AND bc.capability_id = c.capability_id
                 AND c.key = %s""",
            (str(business_id), cap_key),
        )
        if cur.rowcount == 0:
            raise LookupError("Could not disable a capability to simulate drift")

    return {"ok": True, "disabled_capability_key": cap_key}
