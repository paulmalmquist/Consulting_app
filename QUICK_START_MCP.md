# Quick Start: Business Machine MCP Server

**TL;DR** - Your Business Machine repo now has a powerful MCP server that lets Claude Code and Codex CLI manage env vars, run git operations, call APIs, manipulate the frontend, and delegate tasks to Codex.

## Installation (5 minutes)

### 1. Set Up Environment

```bash
# Navigate to backend
cd backend

# Ensure venv is active and deps are installed
source .venv/bin/activate
pip install -r requirements.txt

# Create .env if it doesn't exist
cp .env.example .env
```

### 2. Configure `.env`

Add these variables to `backend/.env`:

```bash
# MCP Server
MCP_API_TOKEN=your-secure-random-token-here
ENABLE_MCP_WRITES=true
MCP_ACTOR_NAME=claude_code

# Database (required for db.upsert)
DATABASE_URL=postgresql://user:pass@localhost:5432/business_os

# Optional: Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-key-here
```

### 3. Test It

```bash
# From backend/
python tests/test_mcp_smoke.py

# Should see:
# ✅ All smoke tests passed!
```

### 4. Use with Claude Code

The MCP server is already configured in `.codex/config.toml`. Just start using it!

```
Claude, can you list all available MCP tools?
```

## Quick Tool Reference

| Tool | Purpose | Permission |
|------|---------|-----------|
| `env.get` | Check if env var is set (no value reveal by default) | Read |
| `env.set` | Set env var in `.env` or `.env.local` | Write |
| `git.diff` | Show git diff with optional path filter | Read |
| `git.commit` | Stage and commit changes | Write |
| `fe.run` | Run lint/test/typecheck/dev/build | Read |
| `fe.edit` | Placeholder for file editing (use `codex.task` instead) | Write |
| `api.call` | Make HTTP requests to backend API | Read |
| `db.upsert` | Insert/update database records via backend | Write |
| `codex.task` | Delegate complex tasks to Codex CLI | Write |

## Common Workflows

### Add an Environment Variable

```
Claude, set NEXT_PUBLIC_API_BASE_URL to http://localhost:8000 in repo-b/.env.local
```

### Create a Database Record

```
Claude, create a business record with:
- id: 123e4567-e89b-12d3-a456-426614174000
- name: Demo Corp
- industry: Technology

Use db.upsert with confirm=true
```

### Run Frontend Checks

```
Claude, run the typecheck and lint commands on the frontend
```

### Delegate to Codex CLI

```
Claude, use codex.task to add a "Documents" link to the main navigation bar.
Mode: apply_changes
Files: repo-b/src/app/**, repo-b/src/components/**
```

### Check Git Changes

```
Claude, show me the git diff for repo-b/src/** files
```

### Commit Changes

```
Claude, commit all staged changes with message "feat: add document navigation link"
```

## Security Features

- **Path Sandboxing**: File operations restricted to allowlisted directories
- **Secret Redaction**: Never logs env values or API keys
- **Write Confirmation**: All write tools require `confirm=true`
- **Rate Limiting**: 60 requests/minute by default
- **Audit Trail**: All tool calls logged to database

## Troubleshooting

### MCP Server Won't Start

```bash
# Check if backend venv is activated
which python
# Should show: /path/to/backend/.venv/bin/python

# Verify MCP_API_TOKEN is set
echo $MCP_API_TOKEN

# If empty, add to backend/.env:
echo "MCP_API_TOKEN=$(openssl rand -hex 16)" >> backend/.env
```

### "Write tool blocked"

Enable writes in `backend/.env`:
```bash
ENABLE_MCP_WRITES=true
```

### Backend Not Running

```bash
# Start backend server
cd backend
uvicorn app.main:app --reload
```

### Codex CLI Not Found

Install from: https://developers.openai.com/codex/cli/

## Full Documentation

See [docs/MCP_SETUP.md](docs/MCP_SETUP.md) for complete reference.

## Architecture

```
┌─────────────────┐
│  Claude Code    │
│  (MCP Client)   │
└────────┬────────┘
         │ JSON-RPC via STDIO
         ▼
┌─────────────────────────────────┐
│  Business Machine MCP Server    │
│  (backend/app/mcp/server.py)    │
├─────────────────────────────────┤
│  Tools:                         │
│  • env.{get,set}               │
│  • git.{diff,commit}           │
│  • fe.{run,edit}               │
│  • api.call                     │
│  • db.upsert                    │
│  • codex.task ──────┐          │
└──────────┬──────────┘          │
           │                      │
           ▼                      ▼
  ┌────────────────┐    ┌──────────────┐
  │ Backend API    │    │  Codex CLI   │
  │ localhost:8000 │    │  (Worker)    │
  └────────────────┘    └──────────────┘
```

## What's Next?

1. **Use it!** Ask Claude Code to manage your Business Machine repo
2. **Customize** allowlists in `backend/.env` (see MCP_ALLOWED_REPO_ROOTS)
3. **Extend** by adding new tools in `backend/app/mcp/tools/`
4. **Monitor** via `audit_events` table in database

---

Built with [Model Context Protocol](https://modelcontextprotocol.io/) and [Claude Code](https://code.claude.com/).
