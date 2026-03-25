# Winston — Real Estate Document Intelligence: Architecture Plan

> **Context:** An expert advisory identified 20 capability areas where a document intelligence layer would transform Winston from a chat interface into a full deal-desk intelligence platform. This document prioritizes those areas, maps what's already in the platform, specifies what needs to be built, and sequences the build into four delivery phases.
>
> **Top 5 from advisor (in priority order):** Structured extraction → Clause library → Covenant monitoring → Document→model integration → Change detection/redlining.

---

## Current State Inventory

Before building anything, here's what the platform already has:

| Capability | Status | Location |
|---|---|---|
| PDF upload & storage | ✅ Live | Supabase Storage / `documents` bucket |
| Parent-child chunking | ✅ Live | `rag_indexer.py` |
| pgvector semantic search | ✅ Live | `rag_chunks` table, HNSW index |
| `content_type_hint` column | ✅ In schema | `rag_chunks` — values: `ic_memo`, `operating_agreement`, `uw_model` |
| `/ask-doc` endpoint (planned) | 🔲 Designed | `WINSTON_DOCUMENT_ASSET_CREATION_PROMPT.md` |
| Structured asset extraction | 🔲 Designed | `document_extractor.py` schema in doc above |
| Unstructured free-text extraction | ✅ Partial | `pdfplumber` text injection into system prompt |
| Confirmation gate for writes | 🔲 Designed | `WINSTON_AGENTIC_PROMPT.md` |
| Re-ranking pipeline | 🔲 Designed | `WINSTON_RERANKING_AND_MODEL_DISPATCH_PROMPT.md` |
| Clause extraction | 🔲 Not started | — |
| Covenant monitoring | 🔲 Not started | — |
| Document versioning | 🔲 Not started | — |
| Redlining / diff | 🔲 Not started | — |

---

## Advisory Points — Full Coverage

### PRIORITY TIER 1 — Build First (Months 1–2)

These five are the foundation everything else sits on. They also happen to be the advisor's top five.

---

#### 1. Structured Extraction for Core Document Types

**What the advisor said:** The platform needs document-type-aware extraction schemas, not generic text dump. Each document type (loan agreement, lease, PSA, JV agreement, appraisal) produces structured JSON that maps to the REPE data model.

**What we have:** `pdfplumber` raw text injection. No schema. One `content_type_hint` column with three values.

**What we need to build:**

*`backend/app/services/document_classifier.py`*
- Page-level heuristic pass (keyword density, section headings) to detect document type
- Returns: `DocumentClass` enum: `LOAN_AGREEMENT | LEASE | PSA | JV_AGREEMENT | APPRAISAL | IC_MEMO | OPERATING_AGREEMENT | RENT_ROLL | DRAW_SCHEDULE | UNKNOWN`
- Confidence score (0.0–1.0); if < 0.6, Winston asks user to confirm type before extraction

*`backend/app/services/document_extractor.py`* — extend with type-specific schemas:

```python
# Loan Agreement schema
class LoanExtraction(BaseModel):
    lender: str | None
    borrower: str | None
    loan_amount: float | None
    interest_rate: float | None          # e.g. SOFR + 250bps
    rate_type: Literal["fixed", "floating", "hybrid"] | None
    maturity_date: date | None
    extension_options: list[str]         # "two 12-month extensions at lender discretion"
    ltv_at_origination: float | None
    dscr_covenant: float | None          # minimum DSCR per covenant
    occupancy_covenant: float | None     # minimum physical occupancy
    prepayment_penalty: str | None
    guarantor: str | None
    recourse: Literal["full", "partial", "non-recourse"] | None
    covenants: list[Covenant]            # see Covenant schema below

# Lease schema
class LeaseExtraction(BaseModel):
    tenant_name: str | None
    tenant_entity: str | None
    lease_type: Literal["gross", "modified_gross", "NNN", "absolute_net"] | None
    premises_address: str | None
    rentable_sf: float | None
    usable_sf: float | None
    lease_commencement: date | None
    lease_expiration: date | None
    term_months: int | None
    base_rent_psf: float | None
    annual_escalation: str | None        # "3% fixed" or "CPI + 1%"
    free_rent_months: int | None
    tenant_improvement_allowance: float | None
    security_deposit: float | None
    renewal_options: list[RenewalOption]
    termination_options: list[TerminationOption]
    co_tenancy_clause: bool
    exclusivity_clause: str | None
    use_clause: str | None
    guarantor: str | None

# PSA schema
class PSAExtraction(BaseModel):
    buyer: str | None
    seller: str | None
    purchase_price: float | None
    earnest_money: float | None
    due_diligence_period_days: int | None
    closing_date: date | None
    financing_contingency: bool
    financing_contingency_deadline: date | None
    inspection_contingency: bool
    prorations: str | None
    representations_expiration: str | None
    escrow_agent: str | None
    title_company: str | None

# JV Agreement schema
class JVExtraction(BaseModel):
    gp_entity: str | None
    lp_entities: list[str]
    gp_commitment_pct: float | None
    lp_commitment_pct: float | None
    preferred_return: float | None
    waterfall_structure: str | None      # e.g. "80/20 after 8% pref"
    promote_hurdles: list[PromoteHurdle]
    management_fee: float | None         # % of invested capital per year
    decision_rights: str | None          # majority vs unanimous
    fund_term_years: int | None
```

*Database:* New `document_extractions` table:
```sql
CREATE TABLE document_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    document_class TEXT NOT NULL,
    extraction_json JSONB NOT NULL,
    extraction_version INT NOT NULL DEFAULT 1,
    confidence FLOAT,
    extracted_at TIMESTAMPTZ DEFAULT now(),
    extracted_by TEXT DEFAULT 'winston-v1'
);
CREATE INDEX idx_doc_extractions_doc ON document_extractions(document_id);
```

*Winston integration:* When a document is uploaded, the classifier runs automatically. If confidence ≥ 0.6, extraction runs immediately and results are stored. Winston surfaces the extracted fields as a confirmation table before any write to `repe_asset`, `repe_deal`, etc.

---

#### 2. Lease Abstracting with Full Schema

**What the advisor said:** Lease abstracting is a $500–$1,500/lease manual process today. Full automation with exception flagging would be the single highest-ROI feature for GP operations teams.

**Build on top of:** The `LeaseExtraction` schema from #1 above.

**Additional components needed:**

*Exception flagging:* After extraction, run rule-based checks:
- `free_rent_months > 6` → flag as above-market concession
- `base_rent_psf < market_median_psf * 0.85` → flag as below-market (requires market data feed or user-configured benchmark)
- `co_tenancy_clause == True` → flag as risk (anchor dependency)
- `termination_options` is not empty → flag with month + penalty
- `annual_escalation` contains "CPI" without a cap → flag as uncapped escalation risk

*Rent roll synthesis:* When multiple leases are uploaded for the same asset, Winston can synthesize a rent roll view:
- Stacking plan by floor/unit (if SF and unit data present)
- Weighted average lease term (WALT) computation
- Near-term expiry alerts (leases expiring within 24 months)
- Rollover exposure by tenant and by year

*Winston command:* `"abstract all leases for Ashford Commons"` → runs batch extraction on all documents tagged to that asset with `document_class = 'LEASE'`.

---

#### 3. Covenant & Risk Monitoring

**What the advisor said:** Loan covenants and JV reporting obligations get missed. An automated monitoring layer that reads the extracted covenants and compares them to live financial data would be transformative.

**New schema additions:**

```python
class Covenant(BaseModel):
    covenant_type: Literal["financial", "reporting", "operational", "maintenance"]
    description: str
    metric: str | None          # e.g. "DSCR", "physical_occupancy"
    threshold: float | None     # e.g. 1.20
    threshold_operator: Literal[">=", "<=", ">", "<"]
    frequency: Literal["monthly", "quarterly", "annual", "at_closing"] | None
    cure_period_days: int | None
    consequence: str | None     # "cash trap", "event of default", "springing guarantee"
```

*New table:* `covenant_monitoring`
```sql
CREATE TABLE covenant_monitoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_extraction_id UUID REFERENCES document_extractions(id),
    asset_id UUID REFERENCES repe_asset(id),
    covenant_type TEXT,
    metric TEXT,
    threshold FLOAT,
    threshold_operator TEXT,
    frequency TEXT,
    last_checked_at TIMESTAMPTZ,
    last_value FLOAT,
    status TEXT CHECK (status IN ('compliant', 'at_risk', 'breach', 'unknown')),
    alert_threshold_pct FLOAT DEFAULT 0.10   -- warn when within 10% of covenant
);
```

*Monitoring job:* Runs on each quarter-close event. Pulls financial metrics from `re_asset_quarter_state`, compares to covenant thresholds. Emits `covenant_alert` records. Winston surfaces breaches in the Command Center without being asked.

*Winston Q&A:* `"are we covenant-compliant on the Cypress Point loan?"` → Lane C query, RAG on the loan document + direct query to `covenant_monitoring` for the asset.

---

#### 4. Document → Model Integration

**What the advisor said:** Documents need to feed directly into the underwriting model. Extracted rent, expenses, and financing terms should auto-populate the model rather than being re-keyed.

**This is the `/ask-doc` → `repe.create_asset` flow already designed, extended further:**

*Bidirectional sync:*
- Upload → extract → populate `repe_asset` fields (already designed)
- NEW: `"push lease terms to model"` → extracted `base_rent_psf`, `rentable_sf`, `annual_escalation` → update underwriting scenario inputs in `re_scenario`
- NEW: `"update the financing assumptions from this term sheet"` → extracted loan terms → update `re_scenario.debt_assumptions`

*Extraction → model field mapping:* Requires an explicit mapping config per document type:
```python
# lease → underwriting model fields
LEASE_TO_MODEL_MAP = {
    "base_rent_psf": "uw_in_place_rent_psf",
    "rentable_sf": "uw_nra_sf",
    "lease_expiration": "uw_lease_term_end",
    "annual_escalation": "uw_rent_growth_rate",
}
```

*Winston command:* `"load the rent roll from the OA into the underwriting model for Fund II"` → batch extraction + mapping → confirmation table → user approves → `re_scenario` rows updated.

---

#### 5. Change Detection / Redlining

**What the advisor said:** When a loan is modified, a lease amendment is executed, or a PSA gets an addendum, the team needs to know exactly what changed — not re-read the whole document.

**New service:** `backend/app/services/document_differ.py`

```python
class DocumentDiff(BaseModel):
    document_id_v1: UUID
    document_id_v2: UUID
    diff_generated_at: datetime
    changed_fields: list[FieldDiff]
    added_clauses: list[str]
    removed_clauses: list[str]
    modified_clauses: list[ClauseDiff]
    risk_delta: str | None   # narrative: "DSCR covenant tightened from 1.20x to 1.25x"

class FieldDiff(BaseModel):
    field_name: str
    value_v1: Any
    value_v2: Any
    change_type: Literal["increased", "decreased", "changed", "added", "removed"]
    significance: Literal["high", "medium", "low"]
```

*High-significance changes auto-flagged:*
- Any change to covenant thresholds
- Any change to loan amount, interest rate, maturity
- Any removal of a renewal option
- Any addition of a termination right
- Any change to promote hurdles or preferred return

*Winston command:* `"what changed in the loan amendment vs the original loan agreement?"` → diff run on-demand, results presented as a structured before/after table with narrative summary of risk implications.

---

### PRIORITY TIER 2 — Build Next (Months 2–3)

---

#### 6. Clause Library

**What the advisor said:** The platform should build a searchable library of extracted clauses across the entire portfolio — normalized, tagged, and searchable. GPs spend hours hunting for precedent language.

**Architecture:**

*New table:* `clause_library`
```sql
CREATE TABLE clause_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL,
    document_id UUID REFERENCES documents(id),
    document_class TEXT,
    clause_type TEXT,           -- 'co_tenancy', 'exclusivity', 'termination', 'DSCR_covenant'
    clause_text TEXT,
    clause_summary TEXT,        -- 1-2 sentence summary by Winston
    clause_embedding VECTOR(1536),
    asset_id UUID,
    fund_id UUID,
    is_favorable BOOLEAN,       -- GP-flagged
    is_risky BOOLEAN,
    tags TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_clause_embedding ON clause_library USING hnsw (clause_embedding vector_cosine_ops);
```

*Populating the library:* When extraction runs, each extracted clause/covenant goes into `clause_library` with a Winston-generated one-sentence summary and embedding.

*Winston search:* `"find all leases with co-tenancy clauses across the portfolio"` → vector search on `clause_library` where `clause_type = 'co_tenancy'`. Returns tenant, asset, clause text, and flagged risk level.

*Precedent search:* `"what language have we used in the past for DSCR cure periods?"` → semantic search across `clause_library` filtered to `document_class = 'LOAN_AGREEMENT'`.

---

#### 7. Portfolio-Level Document Insights

**What the advisor said:** Aggregate views across the entire portfolio — not per-document, but synthesized intelligence. What's our weighted average lease term? What's our total debt maturity exposure by year?

**Winston commands (Lane C/D):**
- `"what's our WALT across all office assets in Fund II?"` → aggregates `LeaseExtraction.term_months` across all assets in Fund II
- `"show me our debt maturity schedule"` → aggregates `LoanExtraction.maturity_date` across all assets, groups by year, returns bar data
- `"which assets have co-tenancy clauses?"` → cross-portfolio clause query
- `"what's our total rent expiring in 2027?"` → sum of `base_rent_psf * rentable_sf` for leases expiring in calendar year 2027

**Implementation:** New MCP tool `repe.document_portfolio_query` — takes a structured query spec and runs aggregation SQL against `document_extractions` + `clause_library`, returns JSON for Winston to narrate.

---

#### 8. Document Versioning & Lineage

**What the advisor said:** Every document has a history. The LOI becomes the PSA becomes the amendment. The term sheet becomes the loan agreement. The platform needs to track that lineage.

**Schema additions:**

```sql
-- Add to documents table (or create new table)
ALTER TABLE documents ADD COLUMN version_of UUID REFERENCES documents(id);
ALTER TABLE documents ADD COLUMN version_number INT DEFAULT 1;
ALTER TABLE documents ADD COLUMN document_status TEXT DEFAULT 'current'
    CHECK (document_status IN ('current', 'superseded', 'draft', 'executed'));

CREATE TABLE document_lineage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_document_id UUID REFERENCES documents(id),
    child_document_id UUID REFERENCES documents(id),
    relationship_type TEXT CHECK (relationship_type IN (
        'supersedes', 'amends', 'replaces', 'references', 'exhibits_to'
    )),
    effective_date DATE,
    notes TEXT
);
```

*Winston command:* `"show me the history of the Riverside Tower loan documents"` → traverses `document_lineage` chain, returns timeline of versions with key change summaries between each version.

*Upload UI:* When uploading a new document, Winston checks if a document of the same type already exists for that asset and asks: "Is this an amendment to [existing document]? I'll link them in the lineage."

---

#### 9. Investor Report Intelligence

**What the advisor said:** GPs spend days writing quarterly reports. Winston should be able to draft the narrative sections using the underlying data.

**New MCP tool:** `repe.draft_investor_report`

Input: `{ fund_id, quarter, report_type: "qr" | "annual", sections: ["portfolio_update", "financial_summary", "market_commentary"] }`

Processing:
1. Pull financial metrics from `re_fund_quarter_state` and `re_asset_quarter_state`
2. RAG over IC memos and operating agreements for fund mandate/strategy language
3. RAG over any market commentary documents indexed for the fund
4. Lane D query to `gpt-4o` with full data context → generate draft sections

Output: Draft Markdown with highlighted sections that need GP review (flagged with `[REVIEW]` markers).

Winston command: `"draft the Q4 portfolio update section for Fund III"` → structured draft with placeholders, tables from live data.

---

#### 10. Smart Upload Experience

**What the advisor said:** The upload flow is friction-heavy. Drag-drop, auto-classify, auto-suggest entity linkage.

**Frontend changes needed:**

*Smart upload modal:*
1. Drag PDF → file pill appears
2. Winston auto-classifies document type within 2 seconds (POST `/api/ai/gateway/classify-doc`)
3. Shows: "This looks like a **Lease Agreement** — should I link it to [asset name based on document content]?"
4. User confirms or corrects entity linkage
5. Extraction runs in background; Winston notifies when complete

*New endpoint:* `POST /api/ai/gateway/classify-doc` — takes file, returns `{ document_class, confidence, suggested_entity_id, suggested_entity_type }` within ~1.5s using just the first 2 pages of text.

*Batch upload:* Support uploading an entire deal folder (zip → server extracts → classifies each PDF → presents summary of what was found).

---

### PRIORITY TIER 3 — Build After Core Is Solid (Months 3–4)

---

#### 11. Smart Document Navigation

**What the advisor said:** For a 150-page loan agreement, users need AI-guided navigation — "take me to the default provisions" — not Ctrl+F.

**Implementation:** New MCP tool `repe.navigate_document` — takes a user query and a `document_id`, runs semantic search within `rag_chunks` filtered to that document, returns the matching section heading + page number hint + excerpt. Winston streams the relevant passage as a cited response.

Winston command: `"show me the default provisions in the Cypress Point loan agreement"` → semantic search within document → streams the clause text with `citation` events pointing to the document section.

---

#### 12. Development Document Intelligence

**What the advisor said:** For development deals, the documents are different: construction contracts, draw schedules, permits, architect agreements. The platform should handle these.

**New document classes to add to `DocumentClass` enum:**
`CONSTRUCTION_CONTRACT | DRAW_SCHEDULE | PERMIT | ARCHITECT_AGREEMENT | GC_CONTRACT | TITLE_REPORT`

**Construction contract schema:**
```python
class ConstructionContractExtraction(BaseModel):
    contractor: str | None
    contract_type: Literal["GMP", "lump_sum", "cost_plus"] | None
    total_contract_value: float | None
    completion_date: date | None
    liquidated_damages_per_day: float | None
    retainage_pct: float | None
    bonding_required: bool | None
    milestone_schedule: list[Milestone]
```

**Draw schedule:** Extract current draw number, amount drawn to date, remaining budget, expected completion date. Map to `re_scenario.construction_budget` fields.

---

#### 13. Title & Legal Document Analysis

**What the advisor said:** Title reports contain easements, encumbrances, and exceptions that can crater a deal. Winston should flag these automatically.

**Title report extraction schema:**
```python
class TitleReportExtraction(BaseModel):
    effective_date: date | None
    insured_amount: float | None
    legal_description: str | None
    schedule_b_exceptions: list[TitleException]
    easements: list[Easement]
    encumbrances: list[Encumbrance]
    liens: list[Lien]
    zoning_classification: str | None
    flagged_exceptions: list[str]   # auto-flagged high-risk items
```

*Auto-flagging rules:* Flag any exception that contains: "blanket lien", "right of first refusal", "deed restriction", "development restriction", "oil/gas mineral rights", "environmental lien".

---

#### 14. Portfolio Document Dashboard

**What the advisor said:** GPs need a single view of document health across the portfolio — what's missing, what's expiring, what needs attention.

**Frontend component:** New `DocumentDashboard` view accessible from the fund page.

Metrics surfaced:
- Documents per asset (count, last uploaded)
- Missing critical documents by asset (e.g., "Lakeview Commons has no appraisal on file")
- Expiring leases next 12 months with expiry date and rent exposure
- Covenant status by asset (compliant / at-risk / breach)
- Unextracted documents (uploaded but extraction hasn't run or failed)

**Backend:** New endpoint `GET /api/re/portfolio/document-health?env_id=&fund_id=` — returns structured JSON for the dashboard.

---

#### 15. RAG Optimization for Real Estate Documents

**What the advisor said:** Generic RAG misses REPE-specific document patterns — defined terms, cross-references, exhibit structures.

**Already designed in `WINSTON_RERANKING_AND_MODEL_DISPATCH_PROMPT.md`** — the `content_type_hint` metadata boost and hybrid search address this. Additional REPE-specific improvements:

*Defined terms index:* During indexing, extract all `"[Term]" means...` patterns from loan/JV docs. Store in `defined_terms` table. When user asks about a defined term, Winston resolves it without doing a full RAG pass.

*Cross-reference resolution:* When a chunk references "Section 6.2(b)", resolve that reference and include the target section as additional context.

*Exhibit awareness:* Chunks from exhibits should carry a `is_exhibit: true` flag and the exhibit label. Exhibit chunks have lower default relevance but become high-relevance when the query specifically references that exhibit.

---

#### 16. Document Security & Permissions

**What the advisor said:** Documents often contain sensitive lender, GP, or LP information. Not everyone should see everything.

**Schema additions:**
```sql
ALTER TABLE documents ADD COLUMN visibility TEXT DEFAULT 'env'
    CHECK (visibility IN ('env', 'fund', 'deal', 'asset', 'private'));
ALTER TABLE documents ADD COLUMN accessible_roles TEXT[];

-- RAG chunks inherit document visibility
-- rag_chunks already has entity_type/entity_id scoping
-- Add: query-time filter on visibility + user role
```

**Winston enforcement:** Before returning any RAG citation, check that the requesting user's role is in `accessible_roles` for the source document. GP-only documents never surface in LP-facing queries.

---

#### 17. Winston Q&A Over Specific Documents

**What the advisor said:** "Chat with your document" — users want to ask open-ended questions about a specific uploaded document without it being mixed into the broader portfolio context.

**Implementation:** New conversation mode flag: `{ document_scoped: true, document_id: "..." }`.

When `document_scoped: true`:
- RAG is filtered to `WHERE document_id = ?` only
- System prompt switches to: "You are analyzing a single document. Answer questions based only on the content of this document."
- Winston does not make MCP tool calls to the broader REPE data model
- `citation` events include page-level hints

Frontend: "Chat with this document" button on any uploaded document card.

---

### PRIORITY TIER 4 — Strategic Layer (Month 4+)

---

#### 18. Redlining / Change Detection (Full Implementation)

Extends the diff service from Priority 1 (item #5) with:
- Side-by-side rendered diff view in the frontend (similar to GitHub diff view)
- Word-level change highlighting, not just field-level
- GP annotations on changed clauses ("accepted", "pushed back on", "escalated to counsel")
- Integration with external redlining tools via export to `.docx` with tracked changes

---

#### 19. Performance at Scale

**What the advisor said:** As the document corpus grows, extraction and search need to stay fast.

Key improvements (build as scale requires):
- Async extraction queue (Celery or Railway background workers) — don't block the upload response
- Extraction result caching (don't re-extract a document that hasn't changed)
- Incremental re-indexing (only re-embed chunks when document text changes)
- Clause library vector index warm-up at startup
- Per-document RAG budget cap (Lane A questions never trigger document search)

---

#### 20. Strategic Positioning vs. DealCloud / Juniper Square / Yardi / MRI

**What the advisor said:** The document intelligence layer is Winston's differentiation story against legacy platforms.

**The gap:**
- DealCloud: CRM-first, documents are attachments with no intelligence
- Juniper Square: LP portal-first, strong reporting but no extraction or Q&A
- Yardi/MRI: Accounting-first, document management is file folders with metadata fields
- None of them: have an AI layer that reads, extracts, monitors, and drafts across the document corpus

**Winston's positioning:** "Your deal desk already knows what's in every document." The covenant monitoring dashboard, the auto-abstracted rent roll, the change alerts on loan amendments — these are capabilities that cost $200K+/year in manual analyst time at a mid-size PE fund.

**Demonstration script (for investor/prospect demos):**
1. Upload a 120-page loan agreement → Winston classifies in 2s, extracts all covenants in 15s
2. Ask: "What are our financial covenants on this loan?" → Winston answers with citations
3. Upload a lease amendment → Winston detects changes vs. original, flags the rent reduction
4. Ask: "Which of our leases expire in 2026?" → cross-portfolio answer in 3s
5. Ask: "Draft the Q4 investor update for Fund II" → 80% complete draft in 30s

---

## Build Sequence & Dependencies

```
Phase 1 (Month 1):
  [1] Document classifier         → no dependencies
  [1] Type-specific extraction schemas → needs classifier
  [3] Confirmation gate (write tools) → already designed, implement now
  [1] /ask-doc endpoint           → already designed, implement now
  [2] Lease abstracting            → needs extraction schemas

Phase 2 (Month 2):
  [5] document_differ.py          → needs two versions of same doc type
  [3] Covenant monitoring schema  → needs extraction schemas
  [3] Covenant monitoring job     → needs financial data in re_asset_quarter_state
  [4] Document→model mapping      → needs extraction + re_scenario table access
  [6] Clause library table + indexing → needs extraction running

Phase 3 (Month 3):
  [7] Portfolio-level insights MCP tool
  [8] Document versioning schema
  [9] Investor report drafting
  [10] Smart upload modal (frontend)
  [11] Document navigation MCP tool

Phase 4 (Month 4+):
  [12] Development document types
  [13] Title report analysis
  [14] Portfolio document dashboard (frontend)
  [15] RAG: defined terms index, cross-reference resolution
  [16] Document security/permissions
  [17] Document-scoped Q&A mode
  [18] Full redlining view (frontend)
  [19] Async extraction queue
  [20] Sales/demo packaging
```

---

## New Database Tables Summary

| Table | Purpose | Phase |
|---|---|---|
| `document_extractions` | Typed extraction JSON per document | 1 |
| `covenant_monitoring` | Live covenant status tracking | 2 |
| `clause_library` | Searchable extracted clause corpus | 2 |
| `document_lineage` | Version/amendment chains | 3 |
| `defined_terms` | Defined terms from loan/JV docs | 4 |

**Migrations:** All additive. No existing tables modified in Phase 1 or 2 (except adding columns to `documents` in Phase 3).

---

## New Backend Services Summary

| Service / Endpoint | Purpose | Phase |
|---|---|---|
| `document_classifier.py` | Detect document type from raw text | 1 |
| `document_extractor.py` (extended) | Type-specific extraction schemas | 1 |
| `POST /api/ai/gateway/ask-doc` | Multipart upload + extract + stream | 1 |
| `POST /api/ai/gateway/classify-doc` | Fast 2-page classification for UX | 1 |
| `document_differ.py` | Field-level and clause-level diff | 2 |
| `covenant_monitor.py` | Scheduled monitoring job | 2 |
| `repe.document_portfolio_query` | MCP tool for cross-portfolio doc queries | 3 |
| `repe.draft_investor_report` | MCP tool for report drafting | 3 |
| `repe.navigate_document` | MCP tool for in-document semantic nav | 3 |

---

## What a Complete Phase 1 Looks Like

After Phase 1 ships, a user can:

1. Upload any loan agreement, lease, PSA, JV agreement, or appraisal
2. Winston classifies it automatically within 2 seconds
3. Winston extracts all structured fields and presents them in a confirmation table
4. User confirms → extracted data is stored in `document_extractions`
5. If it's a lease attached to an existing asset, Winston offers to populate the rent roll
6. If it's a loan agreement, extracted covenants are written to `covenant_monitoring`
7. `"what are the covenants on the Ashford Commons loan?"` returns an accurate structured answer with citations
8. `"abstract this lease"` returns a full abstract with exception flags highlighted

That is the foundation. Everything else in Phases 2–4 builds on that extraction substrate.
