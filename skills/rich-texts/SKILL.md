---
name: rich-texts
description: Read and summarize Rich Oliveira's iMessage threads (both phone and iCloud). Extracts messages, categorizes what he sent (article, idea, question, work update), and surfaces action items or responses Paul should give.
---

# Rich Texts Skill

Reads Rich Oliveira's iMessage threads (phone + iCloud) directly from macOS `chat.db`, categorizes what he sent, and gives Paul an actionable triage.

## Rich's Contact Info

| Handle | Type |
|--------|------|
| `+13363279043` | SMS/iMessage (phone — this is where the random articles, ideas, and observations live) |
| `rideoliv@icloud.com` | iCloud (longer Claude agent outputs, Novendor work) |
| `richard.oliveira@live.com` | Live/fallback |

## Who Rich Is

Rich Oliveira is Paul's collaborator. Two modes:

1. **Phone thread** (`+13363279043`) — conversational. Random AI articles, tool ideas, business angles, gym updates, banter. The signal-to-noise is moderate. This is the thread Paul wants to "deal with."
2. **iCloud thread** (`rideoliv@icloud.com`) — structured. Claude agent outputs from his Novendor outbound sales operation: lead tables, email drafts, scale-path analysis, Novendor tally updates.

## Extraction Queries

### Phone thread (ideas/articles/banter)
```bash
sqlite3 ~/Library/Messages/chat.db "
SELECT 
  datetime(m.date/1000000000 + strftime('%s','2001-01-01'), 'unixepoch', 'localtime') as sent_at,
  CASE WHEN m.is_from_me = 1 THEN 'Me' ELSE 'Rich' END as sender,
  m.text
FROM message m
JOIN handle h ON m.handle_id = h.ROWID
WHERE h.id = '+13363279043'
  AND m.text IS NOT NULL
ORDER BY m.date DESC
LIMIT 60;"
```

### iCloud thread (Novendor work)
```bash
sqlite3 ~/Library/Messages/chat.db "
SELECT 
  datetime(m.date/1000000000 + strftime('%s','2001-01-01'), 'unixepoch', 'localtime') as sent_at,
  CASE WHEN m.is_from_me = 1 THEN 'Me' ELSE 'Rich' END as sender,
  m.text
FROM message m
JOIN handle h ON m.handle_id = h.ROWID
WHERE h.id IN ('rideoliv@icloud.com', 'richard.oliveira@live.com')
  AND m.text IS NOT NULL
ORDER BY m.date DESC
LIMIT 50;"
```

## Output Format

Run both queries, then present:

### 1. Phone thread triage
For each of Rich's messages, classify it into one of:
- **Article/link** — URL or reference he lobbed; summarize what it is and whether it's actionable
- **Idea** — business concept, product angle, vertical; evaluate it briefly (sharp / half-baked / worth a thread)
- **Question** — something he's asking Paul directly; flag as needs reply
- **Work update** — Novendor, vault, agents, backtesting — brief status note
- **Banter** — gym, jokes, etc. — one-liner, no action needed

Format as a triage table:

| Time | Category | Summary | Action? |
|------|----------|---------|---------|
| 10:43 AM | Banter | "Watching Claude take control of your computer is pretty crazy" | None |
| 10:08 AM | Question | What topics should he add to the vault? (AI, biz optimization, finance — he's asking for Paul's angle) | Reply with verticals |

### 2. Open questions / needs reply
Bullet list of anything Rich asked that Paul hasn't answered yet.

### 3. iCloud thread (Novendor work)
One short paragraph on what his agent shipped — don't dump the full tables.

### 4. Paul's pending actions
What Rich is waiting on from Paul (e.g., "confirm which emails you sent so he can update sent_at").

## Idea Processing Mode

When Paul says "deal with Rich's ideas" or "process what Rich sent":

1. Pull phone thread
2. Isolate all **Article/link** and **Idea** messages
3. For each one, produce:
   - **What it is** (one sentence)
   - **Signal level**: High / Medium / Low — with one-line reason
   - **Suggested response to Rich** — a short reply Paul can copy-paste or riff on
   - **Build angle** — if the idea connects to Winston or Novendor, flag the specific hook

## Notes

- Rich's phone messages are short and conversational — don't over-summarize
- Large Claude output blocks in the iCloud thread should be summarized, not dumped verbatim
- "I wonder if we can make a workaround for the paid stuff" = Rich asking about Apollo.io / LinkedIn Sales Nav alternatives — open question
- Rich is running Ollama + Qwen locally for backtesting strategies (to avoid Claude API costs) — context for any model/tool discussions
- Rich has a "second brain vault" that scrapes daily for high-signal ideas; his agents pull from it to generate projects
- When Paul says "read rich's texts" with no further qualifier, run both threads and deliver full triage
