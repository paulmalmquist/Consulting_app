---
name: novendor-repe-outreach
description: End-to-end Novendor REPE cold outreach pipeline — write firm-specific intro emails, bulk-update Outlook drafts, send from paul@novendor.ai, collect bounces, look up correct addresses via web research, and re-send. Loop until all addresses resolve. Use when Paul asks to send or resend the data strategy / AI intro to a list of REPE contacts.
license: Internal — Novendor
---

# Novendor REPE Outreach Skill

End-to-end pipeline for Novendor cold outreach to REPE firms:

1. Write firm-specific intro emails (Virtus template)
2. Bulk-update Outlook drafts
3. Send from `paul@novendor.ai`
4. Collect bounces from the Outlook sent/inbox
5. Look up correct addresses via web research
6. Re-send until all resolve

---

## Phase 1 — Build the contact list

Collect a list of targets. Each entry needs:
- First name
- Recipient email (best guess)
- Firm name
- Firm domain

Sources in priority order: existing Outlook drafts, CRM, user-provided list, web research.

---

## Phase 2 — Write firm-specific emails

**Template (Virtus model):**

```
{first_name},

I wanted to introduce myself and my group at Novendor.

We work with real estate investment and operating teams that have important data spread across acquisitions, asset management, portfolio reporting, finance, investor reporting, and operating workflows. The goal is to make that data easier to use for AI, reporting, and investment decisions without forcing a large system replacement.

I've built real estate data warehouses from scratch and helped operators turn messy system data into reporting people actually use. That experience has shaped how we approach this work: start with the systems and workflows already in place, clean up the logic around them, and give teams a better way to act on the data.

{FIRM_SPECIFIC_PARAGRAPH}

I would be interested in learning where {FIRM} is in its AI and reporting work, and whether there may be a practical way to partner around data strategy.

The way we think about this is less about "digital transformation" and more about measurable productivity: faster reporting, cleaner handoffs between teams, better use of existing systems, and AI deployments that can be tied back to real operating value.

Would you be open to a short conversation?

Paul Malmquist
Novendor
paul@novendor.ai | novendor.ai
```

**Firm-specific paragraph rules:**
- 2–3 sentences max
- Name the firm's specific strategy (multifamily, industrial, debt+equity, alternatives, etc.)
- Describe the data problem that strategy creates (multi-asset-class = inconsistent metrics, development activity = cost tracking complexity, affordable housing = compliance layer on top of operating data, etc.)
- No puffery, no banned words (see `docs/anti-ai-style.md`)
- No em-dashes

**Subject:** `Data strategy and AI — quick intro from Novendor`

For bulk rewrites, use the workflow pattern — spawn one agent per firm in parallel via `pipeline()`.

### Trigger-led variant (batch 2, 2026-05-29)

When the target list comes with a specific 2025–2026 trigger event per firm (fund close,
senior hire, new strategy/vertical), do NOT use the generic Virtus intro. Write
trigger-led copy instead:
- **Para 1:** Name the specific trigger, then move straight into the firm's specific
  reporting/consolidation pain it creates, and name Novendor as the fix for that layer.
- **Para 2:** Paul's credibility (built REPE data warehouses; data strategy = AI strategy;
  you can't put AI on inconsistent data and get good answers).
- **Para 3:** One-sentence soft ask.

**Subject rules for the trigger-led variant (confirmed by Paul):** trigger-specific per
firm, **must contain the exact phrase "Data Strategy"**, **no hyphens** anywhere in the
subject, **no "quick question"**. Examples: `Data Strategy after the Fund III close`,
`Data Strategy ahead of the industrial expansion`, `Data Strategy as the credit vertical
launches`. (Note: the hyphen ban is for the subject only; hyphenated compounds in the body
like "capital-markets" are fine.)

---

## Phase 3 — Update Outlook drafts and send

Use `win32com.client` (COM automation). Outlook classic must be running.

```python
import win32com.client

outlook = win32com.client.Dispatch("Outlook.Application")
ns = outlook.GetNamespace("MAPI")

# Get the novendor sending account
account = next(acc for acc in ns.Accounts if 'novendor' in acc.SmtpAddress.lower())

# Match drafts by recipient email, update body, set sender, send
drafts = ns.GetDefaultFolder(16)  # 16 = Drafts
items = drafts.Items

for i in reversed(range(1, items.Count + 1)):
    item = items.Item(i)
    to = (item.To or '').lower().strip()
    if to in lookup:
        item.Subject = NEW_SUBJECT
        item.Body = lookup[to]
        item.SendUsingAccount = account
        item.SentOnBehalfOfName = 'paul@novendor.ai'
        item.Save()
        item.Send()
```

**Key notes:**
- Always iterate in **reverse** so indexes stay valid as items are removed after Send()
- `SentOnBehalfOfName = 'paul@novendor.ai'` works when paul@ is an alias on info@novendor.ai
- If a draft throws "inline response" error on first attempt, `.Save()` before `.Send()` usually releases it
- For new sends (not existing drafts), use `outlook.CreateItem(0)` and populate To/Subject/Body/SendUsingAccount/SentOnBehalfOfName before `.Send()`

---

## Phase 4 — Collect bounces

Scan the Outlook inbox for bounce/undeliverable messages. Match bounced addresses against the original send list.

```python
BOUNCE_KEYWORDS = [
    "undeliverable", "delivery failed", "delivery failure",
    "mail delivery", "returned mail", "could not deliver",
    "unable to deliver", "bounce", "non-delivery",
    "550", "551", "552", "553", "554",
]

for store in ns.Stores:
    inbox = store.GetDefaultFolder(6)  # 6 = Inbox
    items = inbox.Items
    items.Sort("[ReceivedTime]", True)
    for i in range(1, items.Count + 1):
        item = items.Item(i)
        subj = (item.Subject or "").lower()
        if any(k in subj for k in BOUNCE_KEYWORDS):
            # extract failed address from body via regex
            ...
```

**De-duplicate bounces:** track which addresses have already been corrected and re-sent in a `resolved` set so the collector doesn't re-surface them on the next run.

Store resolved addresses in `skills/novendor-repe-outreach/resolved_bounces.json` so state persists across runs.

---

## Phase 5 — Look up correct addresses

For each bounced address, attempt resolution in this order:

### 5a — Check email format for the domain
Search: `"{domain}" email format site:rocketreach.co OR site:hunter.io`
Most firms follow `first.last@`, `flast@`, or `firstl@` — identify the pattern then apply it.

### 5b — Confirm the person is still at the firm
Fetch the firm's `/team` or `/people` page directly. If the person is gone, find the correct equivalent role (CFO, COO, Head of Data, VP Finance, etc.).

### 5c — Construct the corrected address
Apply the confirmed format to the correct person's name.

### 5d — If uncertain, try both formats as separate sends
e.g. `syoung@` and `sarah.young@` — one will bounce, one won't.

### 5e — Primary → secondary fallback (batch 2 rule)
If a firm has a **secondary named contact** and the primary's address bounces and can't be
resolved after a format retry, send to the **secondary contact** instead (swap the
salutation to the secondary's first name). The secondary addresses and first names are
stored per-firm in `resolved_bounces.json` under the `batch2_*` key. Order of escalation:
primary → alternate format for primary → secondary contact → (last resort) founder/general
firm contact.

**Common corrections seen in this campaign:**
- `first.last@domain` → `flast@domain` (format mismatch)
- Person left the firm → find current equivalent role and resend to them with updated salutation
- Domain typo in original list (e.g. `artemisrea.com` → `artemisrep.com`)
- Unusual firm format: REEP Equity uses `first@` only; Wheelock uses `last@` only
- Unnamed primary (CFO/Head of Fund Finance) → resolve the actual name from the firm's
  team page during research (e.g. Carmel → Phil Owens; Berkeley → May Geria, Sr Controller)

---

## Phase 6 — Re-send corrected addresses

For each resolved bounce, create a new mail item with the corrected address, pull the original body from the sent folder, swap the salutation if the recipient changed, and send.

```python
# Pull original body from sent folder
sent_folder = store.GetDefaultFolder(5)  # 5 = Sent
items = sent_folder.Items
for i in range(1, items.Count + 1):
    item = items.Item(i)
    if SUBJECT in item.Subject and old_address in (item.To or ''):
        body = item.Body
        break

# Fix salutation if person changed
if old_first != new_first:
    body = body.replace(old_first + ',', new_first + ',', 1)

# Send
mail = outlook.CreateItem(0)
mail.Subject = SUBJECT
mail.To = new_address
mail.SendUsingAccount = account
mail.SentOnBehalfOfName = 'paul@novendor.ai'
mail.Body = body
mail.Send()
```

---

## Phase 7 — Loop until clean

Re-run Phase 4 (collect bounces) after each correction pass. Continue until no new bounces land within ~2 hours of the last send.

Use `resolved_bounces.json` to avoid re-processing already-corrected addresses:

```json
{
  "resolved": [
    {"bad": "wes.wilson@avanath.com", "good": "wwilson@avanath.com", "sent": "2026-05-29"},
    {"bad": "chad.patterson@artemisrea.com", "good": "chad.patterson@artemisrep.com", "sent": "2026-05-29"},
    {"bad": "dennis.harris@stockdalecapital.com", "good": "dharris@stockdalecapital.com", "sent": "2026-05-29"},
    {"bad": "micah.holton@asanapartners.com", "good": "sneudorff@asanapartners.com", "sent": "2026-05-29", "note": "Micah left firm; replaced with Stefan Neudorff CFO"},
    {"bad": "sarah.young@bellpartnersinc.com", "good": "syoung@bellpartnersinc.com", "sent": "2026-05-29"},
    {"bad": "patrick.osullivan@crossharborcapital.com", "good": "posullivan@crossharborcapital.com", "sent": "2026-05-29"}
  ]
}
```

Filter the bounce collector output against this list before actioning new corrections.

---

## Scripts in this campaign

| Script | Purpose |
|---|---|
| `update_quick_intro_drafts.py` | Bulk-rewrite existing Outlook drafts matching "Quick intro" subject |
| `apply_firm_specific_drafts.py` | Apply workflow-generated firm-specific bodies to drafts by recipient email |
| `collect_bounces.py` | Scan Outlook inbox for bounce messages and extract failed addresses |
| `update_outlook_drafts.py` | Earlier rewrite script (REPE partnership outreach batch) |

---

## Anti-AI style rules (enforced)

From `docs/anti-ai-style.md` — never use in email copy:
- delve, dive, unpack, unleash, unlock, harness, leverage (as verb), utilize, streamline, empower, elevate, craft, curate, revolutionize, seamless, robust, holistic, transformative, cutting-edge, pivotal
- "In today's fast-paced world", "Furthermore", "Moreover", em-dashes decoratively, three-item lists with identical rhythm
- Opening with a restatement, ending with a triumphant summary sentence

---

## Routing

Trigger phrases → this skill:
- "send the Novendor outreach", "resend bounces", "fix bounced emails"
- "update Outlook drafts and send", "bulk send from paul@novendor.ai"
- "do another bounce loop", "check for bounces and fix them"
- "write firm-specific emails and send to REPE list"
