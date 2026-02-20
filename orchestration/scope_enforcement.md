# Scope Enforcement

- Allowed directory prefixes are canonicalized to repo-relative paths.
- Changed files are measured from git baseline.
- Any out-of-scope mutation is rejected and rolled back.
- Maximum changed-file count is enforced per execution.
