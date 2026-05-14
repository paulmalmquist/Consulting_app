# Outlook MCP Server

Local MCP server that exposes Classic Outlook (win32com) as Claude tools.

## Tools

| Tool | What it does |
|---|---|
| `outlook_list_accounts` | List all configured Outlook accounts |
| `outlook_create_draft` | Create a single email draft |
| `outlook_create_bulk_drafts` | Create multiple drafts in one call |
| `outlook_send_email` | Send an email immediately |
| `outlook_list_drafts` | List drafts in the Drafts folder |
| `outlook_create_calendar_event` | Create a calendar event (optionally with attendees) |
| `outlook_list_calendar_events` | List upcoming calendar events |

## Setup

### 1. Install dependencies

```
pip install mcp pywin32 pydantic
```

### 2. Register with Claude (claude_desktop_config.json)

Add this to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "outlook": {
      "command": "python",
      "args": ["C:\\Projects\\Consulting_app\\mcp-servers\\outlook-mcp\\server.py"]
    }
  }
}
```

Config file location (Windows):
```
%APPDATA%\Claude\claude_desktop_config.json
```

### 3. Make sure Classic Outlook is open

The server uses win32com COM automation — Classic Outlook must be running before Claude calls any tool.

## Notes

- `sender_account` defaults to `"novendor"` — matches `info@novendor.ai`
- All drafts use `.Save()` not `.Send()` — safe to run without fear of accidental sends
- `outlook_send_email` uses `.Send()` — use only when you're ready to send
- Calendar events with `attendees` set will trigger meeting invite emails
