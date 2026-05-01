from app.services.repe_change_committer import _hash_row, prompt_contains_explicit_approval


def test_audit_row_hash_is_stable_for_receipts():
    assert _hash_row({"b": 2, "a": 1}) == _hash_row({"a": 1, "b": 2})


def test_commit_requires_explicit_approval_phrase():
    assert prompt_contains_explicit_approval("Commit the occupancy change.")
    assert not prompt_contains_explicit_approval("Show me the staged diff.")
