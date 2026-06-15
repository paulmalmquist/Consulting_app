# Installing `idea-to-delivery` as a global skill

Standard `SKILL.md` directory — works in Cowork and Claude Code.

## Global (all projects)

**Claude Code:**
```bash
mkdir -p ~/.claude/skills
cp -r TELEMETRY_TEMPLATE/idea-to-delivery ~/.claude/skills/
```
Restart Claude Code; it triggers from its description, or invoke `/idea-to-delivery`.

**Cowork:** open `idea-to-delivery.skill` and click **Save skill** (or Settings → Capabilities). This installs it globally for Cowork.

## Project-only (this repo)

Drop it next to your other repo skills so it's available when working in `Consulting_app`:
```bash
cp -r TELEMETRY_TEMPLATE/idea-to-delivery .skills/
```
(Your repo already keeps skills in `.skills/` and `skills/`; either works.)

## Verify
```bash
python TELEMETRY_TEMPLATE/idea-to-delivery/scripts/new_idea.py "test idea" --dir /tmp/ideas
```
Should scaffold a dated folder with an idea record, ADR stub, and paired plan.

## Use it
Start from an idea, not a ticket: "let's develop the idea for X", "what should we build for Y", "turn this into tasks and a code+devops plan". It runs ideate→tasks→tandem-plan→document and hands off to `azure-devops-intake` (boar