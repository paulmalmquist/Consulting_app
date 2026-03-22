# Execution Pipeline

1. Classify intent.
2. Load and validate session metadata.
3. Validate model routing against policy.
4. Generate deterministic plan (`plan_id = sha256(session_id + prompt_hash + intent + head_sha)`).
5. Emit plan summary and preview metadata.
6. Enforce approval gate.
7. Execute in isolated worktree branch.
8. Compute deterministic diff summary.
9. Persist immutable execution log and append index chain.
