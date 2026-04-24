#!/bin/bash
# export-rich-messages.sh
# Exports Rich Oliveira's iMessage threads to a JSON file the Cowork sandbox can read.
# Run this once nightly BEFORE the rich-texts-nightly-insights scheduled task.
#
# Setup (one-time):
#   chmod +x ~/VSCodeProjects/BusinessMachine/Consulting_app/scripts/export-rich-messages.sh
#
# Add to cron (runs at 11:45 PM, 15 min before the nightly Cowork task):
#   crontab -e
#   45 23 * * * /Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/scripts/export-rich-messages.sh
#
# Or via launchctl — see docs/rich-intel/SETUP.md for a .plist template.

OUT="/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/docs/rich-intel/raw-messages.json"
LOG="/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/docs/rich-intel/export.log"
DB="$HOME/Library/Messages/chat.db"

echo "[$(date)] Starting Rich messages export..." >> "$LOG"

if [ ! -f "$DB" ]; then
  echo "[$(date)] ERROR: Messages DB not found at $DB" >> "$LOG"
  exit 1
fi

sqlite3 -json "$DB" "
SELECT
  datetime(m.date/1000000000 + strftime('%s','2001-01-01'), 'unixepoch', 'localtime') as sent_at,
  CASE WHEN m.is_from_me = 1 THEN 'Me' ELSE 'Rich' END as sender,
  'phone' as thread,
  m.text
FROM message m
JOIN handle h ON m.handle_id = h.ROWID
WHERE h.id = '+13363279043'
  AND m.text IS NOT NULL
ORDER BY m.date DESC
LIMIT 60

UNION ALL

SELECT
  datetime(m.date/1000000000 + strftime('%s','2001-01-01'), 'unixepoch', 'localtime') as sent_at,
  CASE WHEN m.is_from_me = 1 THEN 'Me' ELSE 'Rich' END as sender,
  'icloud' as thread,
  m.text
FROM message m
JOIN handle h ON m.handle_id = h.ROWID
WHERE h.id IN ('rideoliv@icloud.com', 'richard.oliveira@live.com')
  AND m.text IS NOT NULL
ORDER BY m.date DESC
LIMIT 50;
" > "$OUT"

if [ $? -eq 0 ]; then
  COUNT=$(python3 -c "import json; d=json.load(open('$OUT')); print(len(d))" 2>/dev/null || echo "unknown")
  echo "[$(date)] Export complete. $COUNT messages written to $OUT" >> "$LOG"
else
  echo "[$(date)] ERROR: sqlite3 query failed" >> "$LOG"
  exit 1
fi
