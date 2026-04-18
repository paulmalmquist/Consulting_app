# Winston MCP — Partner Setup Guide

This gives you access to Winston's Novendor tools directly from Codex.
You can query data, manage the pipeline, handle outreach, and run accounting commands.

---

## 1. Open Codex and add a custom MCP

In the Codex app, go to **Settings → MCP Servers → Connect to a custom MCP**.

Select **Streamable HTTP** (not STDIO).

Fill in the fields:

| Field | Value |
|---|---|
| Name | `Winston (Novendor)` |
| URL | `https://authentic-sparkle-production-7f37.up.railway.app/mcp` |
| Authorization header | `Bearer 8b5b2bd939ebf52a085dda1f62ce936a2604842ad5105637e4351a9bbbc854b7` |

Save. Codex will connect and pull in the tool list automatically.

---

## 2. What you can do

Winston has 48 Novendor tools across these areas:

**Pipeline** — list accounts, get account briefs, create and advance opportunities, set next actions, archive accounts

**Contacts** — find missing fields, upsert contacts, link to accounts, score relevance

**Outreach** — view the outreach queue, draft messages, log touches, record replies, schedule follow-ups, promote accounts to outreach-ready

**Proof Assets** — list required assets, attach and mark status, generate offer sheet context

**Tasks** — create, complete, reschedule tasks; list what's due today

**Accounting** — ingest receipts, detect subscriptions, classify spend, match transactions, flag ambiguous items, generate software spend and AI spend reports

---

## 3. Example prompts

```
What accounts are in my outreach queue?
```
```
Draft an outreach message for [account name]
```
```
Show me today's tasks
```
```
Ingest this receipt and classify the expense
```
```
Give me a software spend report
```
```
Advance [account] to the next pipeline stage
```
```
What proof assets are still missing for [account]?
```

---

## 4. Notes

- Write actions (creating records, advancing stages, logging touches) will ask for confirmation before executing.
- You have full read and write access to the Novendor environment.
- If a tool call fails, check that the authorization header is set exactly as shown above — the `Bearer ` prefix is required.
