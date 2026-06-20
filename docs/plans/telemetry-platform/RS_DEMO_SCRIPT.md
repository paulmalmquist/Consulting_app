# RS Telemetry — 20-minute demo script

Companion to the in-app exhibit at `/lab/env/<envId>/telemetry/how-it-works`. Each beat: what to click → what to say → the proof on screen → what can fail → the honest fallback. Open with the How This Works page so the reviewer sees the honesty model first, then walk the live surfaces it links to.

Rule of the room: never present a row as production-verified until it has been clicked on production novendor.ai. The exhibit's verification chips track exactly this.

---

## 0 · How This Works page (1 min)
- **Click:** `/telemetry/how-it-works`.
- **Say:** "Every capability here carries two statuses — is it built, and how far is it verified. Built is not the same as production-verified. Planned and Blocked items say 'Not available' with the reason. The known gaps are at the top, not buried."
- **Proof:** status legend (impl + verify), demo-mode strip, known-gaps box, jump nav.
- **Can fail:** a deep-link 404s. **Fallback:** "That's a nav cleanup item — the data test guards against dead links; if you see one it's a branch artifact, not a fake."

## 1 · Live stream + anomaly catch (4 min)
- **Click:** `/telemetry/stream` (Mission Control).
- **Say:** "1–10 Hz ingest, sub-second end to end, redline classification. The champion is a frozen MAD residual rule promoted out of Databricks."
- **Proof:** charts updating ~1s; verdict flips GO → REVIEW/NO_GO on a seeded anomaly; an event persists.
- **Can fail:** stream worker disabled (`TELEMETRY_STREAM_ENABLED` unset). **Fallback:** point at the fail-closed reason from `derive_stream_reason()` — "this is honest degradation, a named reason, not a flatline pretending to be live." Then use `/telemetry/replay` (deterministic) to show the verdict flip.

## 2 · Follow one stream aggregate (3 min)
- **Click:** How This Works → "Follow one stream aggregate", then `/telemetry/monitoring`.
- **Say:** "Trace a real number bronze → silver → gold to the serving API and UI, each hop with its table and its failure mode."
- **Proof:** `tel_stream_readings_bronze` → `tel_stream_readings` → `tel_stream_minute_agg`; `/stream/health` freshness + ingest lag; watermarks + DQ assertions.
- **Honest line:** "The governed-KPI chain — metric registry → lineage drawer — is shown greyed as Planned for telemetry. It's proven in our REPE surface; it isn't wired to telemetry yet. I won't claim it is."

## 3 · Model lifecycle (3 min)
- **Click:** `/telemetry/registry` → `/telemetry/calibration` → `/telemetry/model-performance`.
- **Say:** "Training in Databricks, MLflow run, a promotion gate with the honest_gate thresholds, a champion alias in `tel_model_runs`, and every prediction attributes back to the model version."
- **Proof:** champion alias + gate JSONB; RUL calibration (CNN-LSTM); per-prediction version + receipt in `tel_predictions`.
- **Can fail:** calibration tab 404 (only if built off the wrong branch). **Fallback:** registry + model-performance still carry the lifecycle story.

## 4 · AI orchestration — cited / governed / refused (4 min)
- **Click:** `/telemetry/copilot` then `/telemetry/governance`.
- **Say:** "The copilot grounds on fetched structured evidence with a two-pass anti-fabrication validator. This is not document RAG — I won't call it that."
- **Proof:** evidence cards, tool trace, refusal metrics; an unanswerable question returns a null_reason, not an invented answer.
- **Honest line:** "Grounding depth is Partial and I verify it live before quoting any pass-rate — I'm not going to read you a number I haven't re-checked on the running app."

## 5 · MCP + audit receipts (3 min)
- **Click:** How This Works → "Audit & tools" (MCP registry snapshot), then `/telemetry/governance` audit stats.
- **Say:** "Tools are typed, permissioned (READ / WRITE_CONFIRMED / ADMIN), and audited. Writes hit a confirmation gate. Every call leaves a redacted receipt in `ai_decision_audit_log`."
- **Proof:** registry snapshot with permission scopes; a denied write without confirmation; a redacted receipt.
- **Honest line:** "Cost is estimated and logged, not enforced — the blocking guardrail is Planned. The telemetry copilot uses an inline allow-list, not the platform MCP registry; the snapshot says so."

## 6 · Delivery OS + culture close (2 min)
- **Click:** How This Works → "Delivery operating system"; then `docs/adr/rs-analytics/`.
- **Say:** "This page shipped the way everything ships: ADO intake → Session Brief → scoped PR → tests → evidence → one-way DONE. Story #654."
- **Proof:** delivery timeline; the ADRs (Google-native operating model, ITAR scoping).
- **Close:** honest scoping — "RL isn't in the 90-day plan because it isn't credibly demoable in three weeks; it's documented with a named carrier. ITAR boundary is the highest-stakes constraint and it's in a decision record, not hand-waved."

---

## Cut order if short on time
Drop in this order, preserving the core: §5 audit detail → §3 calibration tab (keep registry) → §4 to a single refusal example. Never cut §1 (live + fail-closed) or §2 (lineage trace) — they are the proof it's real.

## Backup
Record the full arc before any live showing. If the stream worker is down, `/telemetry/replay` is the deterministic stand-in for §1.
