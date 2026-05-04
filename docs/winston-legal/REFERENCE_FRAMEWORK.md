# Winston Legal — Reference Framework

## What this is and is not

Winston Legal is a **reference implementation and delivery framework**. It demonstrates the pattern of an attorney-supervised legal operating layer that a company can stand up inside its own enterprise AI, document, ticketing, contract, email, and approval systems.

It is not a hosted SaaS legal AI product, an "AI lawyer," or a thin wrapper over a foundation model.

The commercial frame: *Winston prepares the file. Counsel approves the judgment.*

## The eight modules

Each module describes repeatable work that gets absorbed before attorney review. Each names the adapter contract a client implements to plug it into their own stack.

| # | Module | What it absorbs before attorney review | Adapter contract | Example client mappings |
|---|---|---|---|---|
| 1 | **Intake Triage** | Classifying ad-hoc legal requests into structured matters | `IntakeSourceAdapter` | Jira / ServiceNow / Slack / Outlook / Workday / web form |
| 2 | **Legal Memory & Knowledge** | Storing playbooks, clauses, approval rules, prior decisions, policy sources | `KnowledgeBaseAdapter` (read paths) | SharePoint / Confluence / iManage / NetDocuments / native wiki |
| 3 | **First-Pass Contract Review** | Locating clauses, comparing to playbook, generating evidence-grounded findings | `DocumentSourceAdapter` | SharePoint / iManage / Box / Google Drive / NetDocuments |
| 4 | **Decision Packet Builder** | Compiling intake + findings + memory into a prepared file for an attorney | (uses inputs above) | n/a — internal compile step |
| 5 | **Attorney Workbench** | Surfacing matters, evidence gaps, deviations, approvals, memory hits, dispositions | `ApproverRegistryAdapter` | Okta / Active Directory / Workday / native authz |
| 6 | **Outside Counsel Packet Builder** | Assembling facts/timeline/issues/desired-outcome for outside counsel | `ContractOfRecordAdapter` (reads matter context) | Ironclad / DocuSign CLM / SpotDraft / native repo |
| 7 | **Audit Trail** | Recording every step with actor + timestamp | `AuditSinkAdapter` | Splunk / Datadog / native SIEM / records system |
| 8 | **Evidence Retrieval** | Citing source quotes with page/section/confidence on every finding | `DocumentSourceAdapter` | (same as module 3) |

## The adapter contracts

Concrete Protocol definitions live in [backend/app/services/legal_adapters/](../../backend/app/services/legal_adapters/). Each Protocol has a Winston-internal default implementation that backs the demo. A client fork swaps in implementations that read/write their own systems.

See [ADAPTER_CONTRACTS.md](ADAPTER_CONTRACTS.md) for signatures and example client implementations.

## What the demo does NOT include and why

| Capability | Why excluded |
|---|---|
| E-signature execution | Integration concern (DocuSign/Adobe Sign). Adapter contract documented; no impl. |
| Court filing / docket | Out of frame for an in-house legal operating layer. |
| Conflict-checking | Firm-side capability; not in scope for in-house ops. |
| Live redline negotiation UX | Belongs in the contract editor (Word, native CLM), not the operating layer. |
| Real CLM integration | Adapter contract documented; clients pick their CLM. |
| Real ITSM integration | Adapter contract documented; clients pick their ITSM. |

The demo proves the **operating layer**: intake → review → packet → attorney action → outside counsel → audit. Integrations live behind the adapter contracts.

## How a client adopts this

1. **Assess.** Use [MATURITY_LEVELS.md](MATURITY_LEVELS.md) to locate where the legal department is today.
2. **Map.** Walk through [ADAPTER_CONTRACTS.md](ADAPTER_CONTRACTS.md) and identify which client systems back each Protocol.
3. **Stand up the operating layer.** Implement the adapters against the client's stack. The schema, services, and UI shell are reference patterns — copy or re-implement.
4. **Seed Legal Memory.** Load the client's existing playbooks, clauses, approval rules, and historical decisions. This is the defensible asset.
5. **Wire the Attorney Workbench.** Final judgment stays with counsel. The workbench is the bridge.
6. **Turn on the audit sink.** Every Winston-prepared output flows into the client's records or SIEM.

The Winston Legal repo serves as the working specification for what each piece looks like.

## Required UI/copy framing

When extending or rebuilding any Legal surface, use:
- "reference implementation"
- "your legal operating layer"
- "Winston prepares the file. Counsel approves the judgment."
- "first-pass review"
- "attorney-supervised"
- "matter intake"
- "Attorney Workbench"
- "Legal Memory"

Banned phrases (regex-checked in CI when the eval harness is in place): "AI lawyer", "legal advice", "automated legal decisions", "replace your legal department", or any model/provider name in user-facing UI.

## Module framing rule

Describe each module as *what repeatable work it absorbs before attorney review*. Never as *what it replaces in a legal department*. The frame is reducing coordination drag, not replacing judgment.
