---
name: read-texts
description: Read and summarize iMessage/SMS threads for any contact by name, phone, or email. Replaces the contact-specific rich-texts skill with a generalized version. Use when Paul says "read [name]'s texts", "what did [name] say", "scrub [name]'s messages", or "check texts from [name]".
---

# Read Texts Skill

Reads iMessage/SMS threads for any contact directly from macOS `chat.db`. Works for any handle (phone number, iCloud email, or contact name lookup).

## Quick Method — Python Script

A portable script lives at `job-search/read_texts.py`. Run it from Terminal:

```bash
# By name (searches Contacts DB + Messages DB)
python3 ~/VSCodeProjects/BusinessMachine/Consulting_app/job-search/read_texts.py "chip"

# By phone number
python3 ~/VSCodeProjects/BusinessMachine/Consulting_app/job-search/read_texts.py "+15615551234"

# By iCloud email
python3 ~/VSCodeProjects/BusinessMachine/Consulting_app/job-search/read_texts.py "chip@email.com"

# More messages, filter by phrase
python3 ~/VSCodeProjects/BusinessMachine/Consulting_app/job-search/read_texts.py "chip" --limit 100 --search "next week"

# Copy to clipboard
python3 ~/VSCodeProjects/BusinessMachine/Consulting_app/job-search/read_texts.py "chip" | pbcopy
```

## Direct sqlite3 Method (Claude Code sessions on Mac)

When you know the handle already, run these directly in bash:

```bash
# Find the handle first (by partial name, email, or phone fragment)
sqlite3 ~/Library/Messages/chat.db "SELECT id FROM handle WHERE id LIKE '%chip%' OR id LIKE '%rabus%';"

# Once you have the handle(s), pull the thread
sqlite3 ~/Library/Messages/chat.db "
SELECT 
  datetime(m.date/1000000000 + strftime('%s','2001-01-01'), 'unixepoch', 'localtime') as sent_at,
  CASE WHEN m.is_from_me = 1 THEN 'Me' ELSE 'Them' END as sender,
  m.text
FROM message m
JOIN handle h ON m.handle_id = h.ROWID
WHERE h.id IN ('+1XXXXXXXXXX', 'contact@email.com')
  AND m.text IS NOT NULL
ORDER BY m.date DESC
LIMIT 60;"
```

## Known Contacts Directory

| Name | Handle(s) | Notes |
|------|-----------|-------|
| Rich Oliveira | `+13363279043`, `rideoliv@icloud.com`, `richard.oliveira@live.com` | Phone = banter/articles; iCloud = Novendor agent work |
| Chip Rabus | TBD — run script to discover | Job search contact; initial call Apr 21, 2026 |

Update this table whenever a new contact is looked up.

## Output Format

After pulling messages, always:

1. **Show the thread** — oldest to newest, labeled Me / Them, with timestamps
2. **Extract key facts** — what was agreed, what's the ask, what's the next step
3. **Flag action items** — what Paul needs to do, reply to, or follow up on
4. **Update the tracker** — if job-search related, add or update the entry in `job-search/search.md`

## Job Search Context

When reading texts for a job search contact, extract:
- Role / company discussed
- Compensation or engagement structure mentioned
- Meeting date/time agreed
- Any specific asks (resume, portfolio, references)
- Tone signal (warm, lukewarm, screening)

Then immediately update `search.md` with a new row or status update.

## Notes

- The Messages DB is at `~/Library/Messages/chat.db` — not accessible from the Linux Cowork sandbox, only from native Mac processes (Claude Code, Terminal)
- In Cowork sessions, have Paul run `read_texts.py` from Terminal and paste the output, or use Claude in Chrome to run it
- The Contacts DB lookup requires Full Disk Access permission; if it fails, fall back to passing the phone number directly
