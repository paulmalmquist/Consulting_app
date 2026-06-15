#!/usr/bin/env python3
"""Generate the Azure DevOps backlog for the Automated Data Engineering platform.

Single source of truth (the BACKLOG below, derived from the PR 1 plan in
docs/plans/automated-data-engineering/) emits two artifacts:

  - ade_backlog.csv          flat list (Type/Title/Parent/Area/Iteration/Tags/Desc/AC)
  - create_ade_backlog.ps1   az boards script that builds the
                             Epic -> Feature -> Story -> Task hierarchy with
                             parent links, on org=paulmalmquist1984 project=Novendor.

Output is deterministic: the same run always produces byte-identical files.
The PS1 is import-ready but is NOT run by this PR; PR 1 does not mutate live ADO.

Run:  python gen_ade_backlog.py
"""
import csv

ORG = "https://dev.azure.com/paulmalmquist1984"
PROJECT = "Novendor"
AREA_ROOT = "RS-Analytics"   # reuse existing areas under Novendor\RS-Analytics

# Existing area paths reused (created by the telemetry backlog script).
# A dedicated ADE area is an intake-time decision; see backlog.md.
AREAS = ["AgentPlatform", "DevOpsAutomation", "WinstonPrototype"]

# Two delivery phases instead of dated sprints: PR 1 ships with this branch,
# PR 2+ is future work consumed by azure-devops-intake later.
ITERATIONS = [
    ("ADE PR1 - Governed fabric surface", "2026-06-12", "2026-06-30"),
    ("ADE PR2+ - Provider abstraction & analytical engine", "2026-07-01", "2026-12-31"),
]
PR1, PR2 = (i[0] for i in ITERATIONS)

A = lambda d: f"{AREA_ROOT}\\{d}"          # area-path helper
BASE_TAG = "ADE"

# Metadata carried as tags on every item (the telemetry generator carries
# metadata in the Tags column; ADE adds three fields the same way):
#   DeliveryPhase=PR1|PR2+          which PR the item belongs to
#   StatusOnMerge=Done              PR 1 items only -- already implemented at merge
#   ImplementationMode=ExistingFabricSurface|NetNew
def tags(phase, mode):
    parts = [BASE_TAG, f"DeliveryPhase={phase}"]
    if phase == "PR1":
        parts.append("StatusOnMerge=Done")
    parts.append(f"ImplementationMode={mode}")
    return "; ".join(parts)

EFS = "ExistingFabricSurface"
NEW = "NetNew"

# ---- BACKLOG -------------------------------------------------------------
# epic:    (title, area, iteration, phase, mode, desc, [features])
# feature: (title, area, iteration, phase, mode, desc, [stories])
# story:   (title, iteration, phase, mode, desc, [acceptance], [tasks], area override)
def epic(title, area, it, phase, mode, desc, features):
    return {"title": title, "area": area, "it": it, "phase": phase, "mode": mode,
            "desc": desc, "features": features}
def feat(title, area, it, phase, mode, desc, stories):
    return {"title": title, "area": area, "it": it, "phase": phase, "mode": mode,
            "desc": desc, "stories": stories}
def story(title, it, phase, mode, desc, ac=None, tasks=None, area=None):
    return {"type": "User Story", "title": title, "it": it, "phase": phase,
            "mode": mode, "desc": desc, "ac": ac or [], "tasks": tasks or [],
            "area": area}

BACKLOG = [
  epic("Automated Data Engineering Platform", A("AgentPlatform"), PR1, "PR1", EFS,
       "Winston as a governed connector/skill fabric: data requests become ADO-tracked, "
       "skill-governed, receipt-audited delivery. PR 1 names and surfaces the existing "
       "fabric (MCP registry, audit receipts, connector inventory, control room); "
       "provider abstraction and the analytical engine are future work.",
       [
        feat("Product Docs & Positioning", A("WinstonPrototype"), PR1, "PR1", EFS,
             "Plan folder, product brief, architecture mapping onto existing code, "
             "trust boundaries, ADRs, and the import-ready ADO backlog.",
             [story("Write the ADE plan folder", PR1, "PR1", EFS,
                    "docs/plans/automated-data-engineering/: README, product-brief, "
                    "architecture, connector-inventory, security-and-trust-boundaries, "
                    "backlog, roadmap, eval-plan, next-session.",
                    ["All nine plan files exist and pass an anti-ai-style.md read",
                     "architecture.md links RS plan sections instead of restating them",
                     "connector-inventory.md matches ade_connectors.py declarations"],
                    ["Draft the nine plan files", "Cross-check inventory table against backend declarations"]),
              story("Record the model-access and portability ADRs", PR1, "PR1", EFS,
                    "docs/adr/automated-data-engineering/: 0001-model-access-strategy "
                    "(stay Winston-managed; three target modes documented, deferred) and "
                    "0002-surface-portability (platform-core package, per-env mount).",
                    ["Both ADRs use docs/adr/0000-template.md and are append-only",
                     "0001 defers BYO-key and provider abstraction with no code shipped"],
                    ["Write ADR 0001", "Write ADR 0002"]),
              story("Generate the import-ready ADO backlog", PR1, "PR1", NEW,
                    "gen_ade_backlog.py emits ade_backlog.csv and create_ade_backlog.ps1 "
                    "deterministically. File only; the PS1 is not run and no live board "
                    "mutation happens in PR 1.",
                    ["python gen_ade_backlog.py twice yields byte-identical CSV and PS1",
                     "PS1 only creates work items with parent links; no updates or deletes",
                     "Every item carries DeliveryPhase, ImplementationMode, and (PR1 only) StatusOnMerge tags"],
                    ["Write the generator", "Run it and commit the generated files"],
                    area=A("DevOpsAutomation")),
              story("Register routing for the ADE surface", PR1, "PR1", EFS,
                    "CLAUDE.md intent-taxonomy and owning-surface rows plus an "
                    "instruction-index entry for the new plan folder.",
                    ["ADE requests route to the plan folder + feature-dev",
                     "New code paths appear in the owning-surface map"],
                    ["Add CLAUDE.md rows", "Register in docs/instruction-index.md"],
                    area=A("DevOpsAutomation"))]),

        feat("Skill Registry Surfacing & Governance", A("AgentPlatform"), PR1, "PR1", EFS,
             "Expose the existing MCP ToolDef registry (~82 tools: permission, "
             "side-effect class, confirmation, lanes, audit policy) through a "
             "read-only product API.",
             [story("Serve the skill registry list endpoint", PR1, "PR1", EFS,
                    "GET /api/ade/skill-registry returns name, module, description, "
                    "permission, side_effect_class, permission_required, "
                    "confirmation_required, lane_tags, skill_tags, input field names.",
                    ["Returns >0 tools or null_reason mcp_registry_unavailable",
                     "List response omits full JSON schema bodies (tested)",
                     "Route carries the same auth protection as telemetry routes"],
                    ["Side-effect-safe registry bootstrap", "Route + response shaping", "Tests in test_ade_routes.py"]),
              story("Serve the per-tool detail endpoint", PR1, "PR1", EFS,
                    "GET /api/ade/skill-registry/{name} returns the full input schema "
                    "for one tool, for the drawer view.",
                    ["Full schema returned for a known tool (tested)",
                     "Unknown tool fails closed with a null_reason, not a stack trace"],
                    ["Detail route", "Tests for known and unknown tool names"])]),

        feat("Connector Inventory & Honest Status", A("AgentPlatform"), PR1, "PR1", EFS,
             "Declared connector statuses (live|stub|script|missing) with evidence "
             "paths. No probing, no credential validation, no env-var liveness inference.",
             [story("Declare the connector inventory in code", PR1, "PR1", EFS,
                    "backend/app/services/ade_connectors.py mirrors "
                    "connector-inventory.md: OpenAI, Git, Supabase/Postgres, Confluent, "
                    "MS Graph, Azure DevOps (script), Databricks (stub), and the "
                    "missing set (GitHub, Vercel, Railway, BigQuery).",
                    ["Status vocabulary is exactly live|stub|script|missing",
                     "Every live connector has an evidence_path (tested)",
                     "Maintenance note in both files: update md and py together"],
                    ["Write the declaration module", "Mirror the markdown table", "Evidence-path test"]),
              story("Serve the connectors endpoint", PR1, "PR1", EFS,
                    "GET /api/ade/connectors merges declarations with derived per-module "
                    "MCP tool counts. Declared statuses only.",
                    ["No external calls, CLI execution, or credential checks (tested by inspection)",
                     "Response includes status, mode, evidence_path, reason, tool_count"],
                    ["Route + merge logic", "Tests"])]),

        feat("Control-Room Frontend", A("WinstonPrototype"), PR1, "PR1", NEW,
             "Portable, env-agnostic control room (AdeShell + Overview, Skill Registry, "
             "Connector Map, Execution Receipts, Playbooks) first mounted in the "
             "telemetry environment. Neutral branding; --bm-* tokens only.",
             [story("Build the portable ADE package", PR1, "PR1", NEW,
                    "repo-b components, typed lib, and catch-all proxy under "
                    "/api/ade/. Every data component implements Loading, Loaded, Empty, "
                    "Unavailable-with-null_reason, and Error states.",
                    ["No RS or telemetry branding anywhere in the core package",
                     "All five component states implemented",
                     "Connector map renders declared status + reason; no fabricated liveness"],
                    ["primitives + AdeShell", "SkillRegistryTable + drawer", "ConnectorMap + ReceiptsFeed + PlaybooksPanel"]),
              story("Mount ADE in the telemetry environment", PR1, "PR1", NEW,
                    "Domain routes under /lab/env/[envId]/automated-data-engineering, "
                    "isDomainRoute regex entry, one TelemetrySidebar link.",
                    ["Route renders full-bleed without the lab sidebar",
                     "Standard lab/telemetry routes unaffected (no double-wrap)",
                     "Sidebar link works"],
                    ["Route pages + layout", "isDomainRoute + sidebar link", "repo-b typecheck/build passes"]),
              story("State the capability claim honestly", PR1, "PR1", EFS,
                    "Overview carries a Capability Claim strip: live now = registry "
                    "surfacing, connector declaration, receipt feed, playbook skeleton; "
                    "not yet = BYO keys, autonomous connector setup, grain detection, "
                    "lakehouse scanning, live ADO creation.",
                    ["Capability Claim strip present on Overview",
                     "No demo copy claims unimplemented capabilities"],
                    ["Write the strip", "Review copy against connector inventory"])]),

        feat("Execution Receipts & Evidence", A("AgentPlatform"), PR1, "PR1", EFS,
             "Surface the existing MCP audit trail (write-time redaction, two-phase "
             "confirmation) as an Execution Receipts feed. Read-only; no schema changes.",
             [story("Serve the receipts endpoint", PR1, "PR1", EFS,
                    "GET /api/ade/runs reuses the existing audit read path for "
                    "mcp.tool_call rows, scoped and limited. If scoped reads are "
                    "unavailable, return runs:[] with a null_reason rather than "
                    "unscoped data.",
                    ["Returns business-scoped rows or null_reason audit_read_unavailable",
                     "No new audit schema, migrations, or persistence changes",
                     "Redaction stays at write time via AuditPolicy"],
                    ["Locate or add one minimal read-only audit query", "Route + scoping guard", "Fail-closed tests"]),
              story("Render the receipts feed", PR1, "PR1", EFS,
                    "ReceiptsFeed table with an evidence drawer showing audit fields "
                    "(tool, status, permission mode, latency, actor, timestamp).",
                    ["Rows render or the null_reason shows; never a blank lie",
                     "Drawer shows audit fields without raw secret values"],
                    ["Feed component", "Evidence drawer"])]),

        feat("Model-Access Strategy (provider abstraction + BYO-key)", A("AgentPlatform"),
             PR2, "PR2+", NEW,
             "Future work recorded in ADR 0001. The model layer stays Winston-managed "
             "(OpenAI via ai_gateway.py) until this feature is scheduled.",
             [story("Design the provider abstraction interface", PR2, "PR2+", NEW,
                    "Concrete interface for the three access modes (Winston-managed, "
                    "BYO-key, enterprise connector) sketched in ADR 0001.",
                    ["Interface covers all three modes without leaking provider details into callers",
                     "Migration path from the current ai_gateway.py documented"],
                    ["Interface spec", "ai_gateway migration notes"]),
              story("Build BYO-key storage and scoping", PR2, "PR2+", NEW,
                    "Per-environment key storage with no raw key display anywhere in "
                    "the UI or API.",
                    ["Keys stored scoped to environment; never returned by any endpoint",
                     "Key removal revokes access immediately"],
                    ["Storage design", "Scoping + revocation", "No-display tests"]),
              story("Add the data-classification redaction gate", PR2, "PR2+", NEW,
                    "Classification check before any payload leaves for an external "
                    "model under BYO-key or enterprise modes.",
                    ["Controlled payloads blocked or redacted before egress",
                     "Gate decisions land in the audit trail"],
                    ["Classification rules", "Gate enforcement", "Audit wiring"])]),

        feat("Analytical Engine (grain detection / join-risk / metric conflicts)",
             A("AgentPlatform"), PR2, "PR2+", NEW,
             "Future analytical capabilities deferred from PR 1; see roadmap.md.",
             [story("Build grain detection", PR2, "PR2+", NEW,
                    "Infer table grain from data and declared keys; flag grain "
                    "mismatches before joins.",
                    ["Grain inferred for sample tables with declared confidence",
                     "Mismatched-grain joins flagged before execution"],
                    ["Inference approach", "Confidence reporting"]),
              story("Build fanout and join-risk detection", PR2, "PR2+", NEW,
                    "Detect row-multiplying joins and warn before a query inflates "
                    "metrics.",
                    ["Known fanout cases caught in tests",
                     "Warning includes the offending join and expected multiplier"],
                    ["Detection rules", "Test fixtures"]),
              story("Build metric-conflict detection", PR2, "PR2+", NEW,
                    "Flag when two sources define the same metric differently; tie "
                    "into the metric registry pattern from the RS plan.",
                    ["Conflicting definitions surfaced with both sources cited",
                     "No silent preference for either definition"],
                    ["Conflict rules", "Registry cross-reference"])]),
       ]),
]

# ---- emit CSV ------------------------------------------------------------
def emit_csv(path):
    rows = []
    def add(t, title, parent, area, it, tag, desc, ac):
        rows.append({"Work Item Type": t, "Title": title, "Parent": parent,
                     "Area Path": f"{PROJECT}\\{area}", "Iteration Path": f"{PROJECT}\\{it}",
                     "Tags": tag, "Description": desc,
                     "Acceptance Criteria": " | ".join(ac) if ac else ""})
    for e in BACKLOG:
        add("Epic", e["title"], "", e["area"], e["it"], tags(e["phase"], e["mode"]), e["desc"], [])
        for f in e["features"]:
            add("Feature", f["title"], e["title"], f["area"], f["it"],
                tags(f["phase"], f["mode"]), f["desc"], [])
            for s in f["stories"]:
                s_area = s["area"] or f["area"]
                add(s["type"], s["title"], f["title"], s_area, s["it"],
                    tags(s["phase"], s["mode"]), s["desc"], s["ac"])
                for tk in s["tasks"]:
                    add("Task", tk, s["title"], s_area, s["it"],
                        tags(s["phase"], s["mode"]), "", [])
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["Work Item Type", "Title", "Parent",
                            "Area Path", "Iteration Path", "Tags", "Description", "Acceptance Criteria"])
        w.writeheader(); w.writerows(rows)
    return len(rows)

# ---- emit PowerShell -----------------------------------------------------
def ps_escape(s):
    return s.replace("`", "``").replace('"', '`"').replace("$", "`$")

def A_full(area):  # area already like 'RS-Analytics\\AgentPlatform'; prefix project
    return f"{PROJECT}\\{area}"
def it_full(it):
    return f"{PROJECT}\\{it}"

def emit_ps1(path):
    L = []
    out = L.append
    out("# Azure DevOps backlog creation for the Automated Data Engineering platform")
    out("# Generated by gen_ade_backlog.py from docs/plans/automated-data-engineering/")
    out("# Run on a machine where az + the azure-devops extension are installed and signed in.")
    out("# It CREATES work items (run once). To check first: az boards query --wiql \"SELECT [System.Id] FROM workitems\".")
    out("# NOT run as part of PR 1; import-ready file only.")
    out("")
    out("$ErrorActionPreference = 'Stop'")
    out("# az.cmd path on Windows; falls back to 'az' on PATH.")
    out(r'$az = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"')
    out(r'if (-not (Test-Path $az)) { $az = "az" }')
    out(f'$ORG = "{ORG}"')
    out(f'$PROJECT = "{PROJECT}"')
    out('& $az devops configure --defaults organization=$ORG project=$PROJECT')
    out("")
    out("function New-WI($type, $title, $area, $iter, $tags, $desc, $ac, $parentId) {")
    out('  $args = @("boards","work-item","create","--type",$type,"--title",$title,')
    out('            "--area",$area,"--iteration",$iter,"--org",$ORG,"--project",$PROJECT,"--output","json")')
    out('  if ($desc) { $args += @("--description",$desc) }')
    out('  $fields = @()')
    out('  if ($tags) { $fields += "System.Tags=$tags" }')
    out('  if ($ac)   { $fields += "Microsoft.VSTS.Common.AcceptanceCriteria=$ac" }')
    out('  if ($fields.Count -gt 0) { $args += @("--fields") + $fields }')
    out('  $wi = & $az @args | ConvertFrom-Json')
    out('  if ($parentId) { & $az boards work-item relation add --id $wi.id --relation-type parent --target-id $parentId --org $ORG --yes | Out-Null }')
    out('  Write-Host ("  [{0}] #{1}  {2}" -f $type, $wi.id, $title)')
    out('  return $wi.id')
    out("}")
    out("")
    out('Write-Host "== Ensuring area paths under $PROJECT\\' + AREA_ROOT + ' (reused from RS-Analytics) =="')
    out(f'& $az boards area project create --name "{AREA_ROOT}" --org $ORG --project $PROJECT 2>$null | Out-Null')
    for a in AREAS:
        out(f'& $az boards area project create --name "{a}" --path "\\{PROJECT}\\Area\\{AREA_ROOT}" --org $ORG --project $PROJECT 2>$null | Out-Null')
    out("")
    out('Write-Host "== Creating iterations =="')
    for name, start, end in ITERATIONS:
        out(f'& $az boards iteration project create --name "{ps_escape(name)}" --start-date {start} --finish-date {end} --org $ORG --project $PROJECT 2>$null | Out-Null')
    out("")
    out('Write-Host "== Creating work items =="')
    for e in BACKLOG:
        out("")
        out(f'Write-Host "Epic: {ps_escape(e["title"])}"')
        out(f'$epic = New-WI "Epic" "{ps_escape(e["title"])}" "{ps_escape(A_full(e["area"]))}" "{ps_escape(it_full(e["it"]))}" "{ps_escape(tags(e["phase"], e["mode"]))}" "{ps_escape(e["desc"])}" "" $null')
        for fi, f in enumerate(e["features"]):
            fv = f"$f{fi}"
            out(f'{fv} = New-WI "Feature" "{ps_escape(f["title"])}" "{ps_escape(A_full(f["area"]))}" "{ps_escape(it_full(f["it"]))}" "{ps_escape(tags(f["phase"], f["mode"]))}" "{ps_escape(f["desc"])}" "" $epic')
            for si, s in enumerate(f["stories"]):
                sv = f"$s{fi}_{si}"
                ac = " | ".join(s["ac"])
                s_area = s["area"] or f["area"]
                out(f'{sv} = New-WI "{s["type"]}" "{ps_escape(s["title"])}" "{ps_escape(A_full(s_area))}" "{ps_escape(it_full(s["it"]))}" "{ps_escape(tags(s["phase"], s["mode"]))}" "{ps_escape(s["desc"])}" "{ps_escape(ac)}" {fv}')
                for tk in s["tasks"]:
                    out(f'New-WI "Task" "{ps_escape(tk)}" "{ps_escape(A_full(s_area))}" "{ps_escape(it_full(s["it"]))}" "{ps_escape(tags(s["phase"], s["mode"]))}" "" "" {sv} | Out-Null')
    out("")
    out('Write-Host "Done. Open Boards to see the ADE epic under ' + AREA_ROOT + '."')
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")

if __name__ == "__main__":
    n = emit_csv("ade_backlog.csv")
    emit_ps1("create_ade_backlog.ps1")
    epics = len(BACKLOG)
    feats = sum(len(e["features"]) for e in BACKLOG)
    stories = sum(len(f["stories"]) for e in BACKLOG for f in e["features"])
    tasks = sum(len(s["tasks"]) for e in BACKLOG for f in e["features"] for s in f["stories"])
    print(f"Epics={epics} Features={feats} Stories={stories} Tasks={tasks} TotalRows={n}")
    print("Wrote ade_backlog.csv and create_ade_backlog.ps1")
