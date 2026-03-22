# Logging Standard

- Every run writes a JSON log under `.orchestration/logs/`.
- Log filenames are timestamp + session id + sequence.
- `index.jsonl` is append-only and stores file hash.
- Log entries include hash chain fields (`hash_prev`, `hash_self`).
