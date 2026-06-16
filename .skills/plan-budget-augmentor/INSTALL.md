# Installing `plan-budget-augmentor`

The skill is a standard `SKILL.md` directory, so it works in both Cowork and Claude Code. Pick the path for your tool.

## Claude Code

Skills live in a `skills/` directory that Claude Code scans. Copy this folder into one of:

- **User-level (all projects):** `~/.claude/skills/plan-budget-augmentor/`
- **Project-level (this repo only):** `<repo>/.claude/skills/plan-budget-augmentor/`

```bash
# user-level
mkdir -p ~/.claude/skills
cp -r TELEMETRY_TEMPLATE/plan-budget-augmentor ~/.claude/skills/

# or project-level
mkdir -p .claude/skills
cp -r TELEMETRY_TEMPLATE/plan-budget-augmentor .claude/skills/
```

Start (or restart) Claude Code in the project. The skill triggers automatically from its description, or invoke it explicitly: `/plan-budget-augmentor`. The bundled script runs with plain `python` (standard library only — no pip installs needed).

To ship it inside a plugin/marketplace instead, drop the same folder under the plugin's `skills/` directory; the format is identical.

## Cowork (desktop app)

Install the packaged `.skill` file: open the `plan-budget-augmentor.skill` card and click **Save skill**. Or add it under **Settings → Capabilities**.

## Verify it works

From the skill directory:

```bash
python scripts/rollup_budget.py assets/budget.csv
```

You should see a one-line summary with one-time, recurring, TCO, and a needs-research count.

## Using it

Point it at the plans and ask for what you need, e.g.:

- "Attach budget line items to the Relativity adoption steps."
- "I decided on BigQuery for the warehouse — update the plans, crosswalk, and budget."
- "Re-roll the budget and show me the 5-year TCO."

The skill maintains `budget.csv`, `BUDGET.md`, `CROSSWALK.md`, and `CHANGELOG.md` next to the plans.
