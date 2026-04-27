#!/bin/bash
OUTPUT_DIR="$HOME/VSCodeProjects/BusinessMachine/Consulting_app/docs/rich-intel"
mkdir -p "$OUTPUT_DIR"
OUTPUT_FILE="$OUTPUT_DIR/raw_messages_$(date +%Y-%m-%d).txt"

echo "=== PHONE THREAD (+13363279043) ===" > "$OUTPUT_FILE"
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
LIMIT 60;" >> "$OUTPUT_FILE"

echo "" >> "$OUTPUT_FILE"
echo "=== ICLOUD/NOVENDOR THREAD ===" >> "$OUTPUT_FILE"
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
LIMIT 50;" >> "$OUTPUT_FILE"

echo "" >> "$OUTPUT_FILE"
echo "DONE" >> "$OUTPUT_FILE"
echo "Output written to: $OUTPUT_FILE"
