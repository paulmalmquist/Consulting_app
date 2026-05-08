# Novendor CRM — Standalone

A portable CRM command surface for Novendor. Works from any Claude session, anywhere.

## What this is

A self-contained directory that gives Claude everything it needs to operate the Novendor CRM — no main repo, no working directory, no setup beyond credentials.

Open this folder in any Claude Code session or Cowork project and you get:
- Full read/write access to the live Supabase database
- Structured skills for every core CRM action
- Consistent identity, table map, and business rules loaded automatically

## Setup (one-time per machine)

1. Set your Supabase access token as an environment variable:
   ```
   SUPABASE_ACCESS_TOKEN=your_token_here
   ```
   Get it from: https://supabase.com/dashboard/account/tokens

2. Open this folder in Claude Code or add it as a Cowork project.

That's it. The `.mcp.json` handles the rest.

## Commands

| Say this | What happens |
|---|---|
| `show me the pipeline` | Full deal summary grouped by urgency |
| `add a contact` | Add contact, link to deal |
| `log outreach to [company]` | Record a message sent or received |
| `add a task: [task]` | Log a task with due date and priority |
| `move [company] to [stage]` | Update deal stage + set next action |
| `what should I work on today` | Pipeline + overdue tasks |

## Structure

```
novendor-crm/
  .mcp.json                     ← Supabase MCP config (auto-connects)
  CLAUDE.md                     ← CRM identity, table map, rules
  skills/
    add-contact/SKILL.md        ← Add and link a contact
    log-task/SKILL.md           ← Add any task
    log-outreach/SKILL.md       ← Record a message/call/meeting
    update-deal/SKILL.md        ← Move deal stage + next action
    pipeline-summary/SKILL.md   ← Full pipeline read
```

## Database

- Supabase project: `ozboonlsplroialdwuxj`
- env_id: `62cfd59c-a171-4224-ad1e-fffc35bd1ef4`
- business_id: `225f52ca-cdf4-4af9-a973-d1d310ddcba1`

All skills use these constants. No config needed at runtime.
