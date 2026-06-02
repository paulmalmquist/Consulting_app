"""Regression guard for the consulting auto-generation stage query.

History (Ticket 2B, 2026-05-19): execution_auto.run_auto_generation pass 8
filtered `WHERE ... AND lower(o.stage) = 'proposal'`, but crm_opportunity has
no `stage` column — stage is the FK crm_opportunity.crm_pipeline_stage_id ->
crm_pipeline_stage. In production this raised
`psycopg.errors.UndefinedColumn: column o.stage does not exist`, which the
Ticket 1 logger fix surfaced as a clean fail-closed 500.

Verified against the live schema (Supabase project ozboonlsplroialdwuxj):
crm_opportunity has crm_pipeline_stage_id + status (NO stage); the proposal
stage is crm_pipeline_stage.key = 'proposal'. The fix joins crm_pipeline_stage
and filters lower(s.key) = 'proposal'.

These are static source assertions (no DB needed) so the guard runs in CI:
they fail loudly if anyone reintroduces the non-existent `o.stage` reference
or drops the pipeline-stage join from the proposal pass.
"""

from pathlib import Path

_SRC = (
    Path(__file__).resolve().parents[1]
    / "app"
    / "services"
    / "execution_auto.py"
).read_text(encoding="utf-8")


def test_no_nonexistent_stage_column_reference():
    """crm_opportunity has no `stage` column — the SQL must not reference it.

    Guards the actual bug shape (the `o.stage` / `o .stage` SQL column ref).
    A comment may still *mention* `crm_opportunity.stage` to explain why it is
    absent — that is documentation, not the defect — so we do not ban the bare
    word, only the qualified-column reference that Postgres would resolve.
    """
    assert "o.stage" not in _SRC, (
        "execution_auto.py references o.stage, but crm_opportunity has no "
        "stage column (stage is the crm_pipeline_stage_id FK). Filter on "
        "crm_pipeline_stage.key instead."
    )
    # The original stale comment that *asserted the column exists* must be gone.
    assert "Stage values come from crm_opportunity.stage" not in _SRC


def test_proposal_pass_joins_pipeline_stage_and_filters_key():
    """The proposal-stage pass must resolve stage via the canonical FK join."""
    assert "crm_pipeline_stage" in _SRC, (
        "Proposal-stage auto-gen pass must JOIN crm_pipeline_stage to resolve "
        "the stage; crm_opportunity.crm_pipeline_stage_id is the FK."
    )
    assert "s.crm_pipeline_stage_id = o.crm_pipeline_stage_id" in _SRC
    assert "lower(s.key) = 'proposal'" in _SRC
