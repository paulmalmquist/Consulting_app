# Underwriting Orchestrator v1

This pipeline is deterministic, citation-aware, and reproducible.

## Data contract

Use `GET /api/underwriting/contracts/research` to retrieve the strict ingest schema.

Core objects:
- `UnderwritingRun`
- `ResearchSource`
- `ResearchDatum`
- `Comps` (`sale_comps`, `lease_comps`)
- `MarketSnapshot`
- `Assumptions`
- `Scenario`
- `ModelResult`
- `ReportArtifact`

Rules:
- Facts must include citation references.
- Uncited values must be assumptions.
- Percent values are decimals (e.g. `0.055`).
- Currency values are integer cents.
- Dates are ISO-8601 at API boundary.

## API flow

1. Create run
```bash
curl -sS -X POST http://127.0.0.1:8000/api/underwriting/runs \
  -H "Content-Type: application/json" \
  -d @sample_property_multifamily.json
```

2. Ingest structured research
```bash
curl -sS -X POST http://127.0.0.1:8000/api/underwriting/runs/<run_id>/ingest-research \
  -H "Content-Type: application/json" \
  -d @sample_research_payload.json
```

3. Run scenarios
```bash
curl -sS -X POST http://127.0.0.1:8000/api/underwriting/runs/<run_id>/scenarios/run \
  -H "Content-Type: application/json" \
  -d '{"include_defaults": true}'
```

4. Fetch report artifacts
```bash
curl -sS http://127.0.0.1:8000/api/underwriting/runs/<run_id>/reports
```

## End-to-end CLI script

```bash
scripts/underwriting_run.sh \
  --business-id <business_uuid> \
  --property-file backend/tests/fixtures/underwriting/sample_property_multifamily.json \
  --research-file backend/tests/fixtures/underwriting/sample_research_payload.json
```

By default this writes all artifacts to:
- `/tmp/underwriting/<run_id>/`

## Determinism + replay

- `run_id` is UUIDv5 over canonicalized create-run input hash.
- Raw research, normalized payload, model inputs, model outputs, and report bundles are versioned snapshots.
- Source ledger includes citation key, URL, access date, and excerpt hash.
