---
name: outlook-email-drafting
description: Draft Outlook emails for Novendor/consulting outreach on Mac through the local novendor-outreach MCP tools or CLI. Use when the user wants Cowork/Claude to write one or more outbound email drafts, use the seeded prospect drafts, or turn structured lead/contact info into Outlook Drafts without sending.
---

# Outlook Email Drafting

Drafts outbound emails into Outlook for Mac. Never sends.

Use this skill when the user wants any of these:

- create one or more Outlook drafts from a prompt
- use the seeded prospect drafts in `scripts/novendor_outreach/prospects.py`
- turn lead/contact rows into Outlook drafts
- have Claude/Cowork prepare subject/body text and save it in Drafts

## Preferred path

Use the local `novendor-outreach` MCP server if available.

Preferred tool order:

1. `list_prospect_drafts` when the user may want an existing seeded draft
2. `create_prospect_draft` for a seeded prospect with optional `to` override
3. `create_outlook_draft` for freeform drafting
4. `list_outlook_drafts` only as a best-effort readback

If the MCP server is not available, fall back to the local CLI:

```bash
python -m scripts.novendor_outreach.cli --accounts
python -m scripts.novendor_outreach.cli --drafts
python -m scripts.novendor_outreach.cli --slug electra-america
python -m scripts.novendor_outreach.cli --subject "Quick note" --body-file /tmp/body.txt --to cfo@example.com --to-name "Jane Doe"
```

## Drafting workflow

1. Confirm whether the user wants:
   - seeded prospect draft
   - freeform one-off draft
   - batch of drafts from contacts/leads
2. Write the subject/body first.
3. Default to concise, plain-text outreach. Avoid hype, fake familiarity, and over-formatting.
4. Save to Outlook Drafts. Never send.
5. Report the drafted subject lines and recipient emails back to the user.

## Writing defaults

- Keep first-touch outreach short.
- Lead with the reason for writing.
- Use one concrete observation or trigger if available.
- End with a low-friction ask.
- Do not fabricate facts, relationships, or prior conversations.

## Seeded prospects

The curated seed list lives in:

- `scripts/novendor_outreach/prospects.py`

When the user asks for "the existing outlook leads/prospects", check that file or call `list_prospect_drafts`.

## Cowork / MCP setup

Cowork should have this MCP server configured against the repo root:

```json
{
  "mcpServers": {
    "novendor-outreach": {
      "command": "python",
      "args": ["-m", "scripts.novendor_outreach.mcp_server"],
      "cwd": "/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app"
    }
  }
}
```

If Cowork is running outside this repo, either open this repo as the working directory or copy the skill to a global skills directory before expecting it to trigger.

## Good prompt shapes

- `Use the outlook-email-drafting skill and draft a note to CFOs at these firms into Outlook Drafts.`
- `Use the seeded prospect drafts and create the Crow Holdings draft with to=asciara@crowholdings.com.`
- `Draft 5 short outreach emails from this lead list and save them to Outlook Drafts.`

## Safety

- Never send email.
- If recipient emails are missing, draft with an empty `to` field and tell the user what is missing.
- If Outlook account matching is flaky, allow fallback to the default configured mailbox rather than blocking draft creation.
