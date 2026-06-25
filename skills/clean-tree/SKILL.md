---
name: clean-tree
description: Classify and safely handle Winston working-tree changes, generated artifacts, misplaced files, and ignore rules without deleting or committing unrelated user work. Use for "clean the tree", "tidy up", "file away loose files", or pre-delivery tree hygiene.
---

# Clean Tree

Run in a dedicated worktree. Treat changes in the shared checkout as user-owned.

1. Inspect `git status --short`, the current branch, and worktrees.
2. Classify each changed/untracked path as task-owned source, durable artifact,
   generated output, scratch material, secret risk, or unrelated user work.
3. Move or ignore only task-owned noise. Do not delete uncertain files.
4. Use `git check-ignore -v` for ignore decisions.
5. Stage explicit task-owned paths only; never use `git add -A`.
6. Review `git diff --cached` before committing.
7. Hand delivery to `winston-full-delivery`.

Do not clean, reset, switch, or stage the shared checkout. Do not use tree
cleanup as permission to absorb unrelated fixes.
