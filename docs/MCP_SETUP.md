# MCP Server Setup - Business Machine

This document explains how to set up and use the Business Machine MCP server with Claude Code and Codex CLI.

## Overview

The Business Machine MCP server provides a comprehensive set of tools for managing your Business OS application, including:

- **Environment Management** (`env.get`, `env.set`)
- **Git Operations** (`git.diff`, `git.commit`)
- **Frontend Management** (`fe.edit`, `fe.run`)
- **API Proxy** (`api.call`)
- **Database Operations** (`db.upsert`)
- **Codex CLI Delegation** (`codex.task`)

All tools respect security boundaries with path sandboxing, secret redaction, and confirmation requirements for write operations.

## Prerequisites

1. **Python 3.8+** with virtual environment
2. **Backend dependencies** installed:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Environment variables** configured (see `.env.example`)
4. **(Optional) Codex CLI** for `codex.task` tool:
   - Install from: https://developers.openai.com/codex/cli/
   - Verify with: `which codex`

## Installation

### 1. Set Environment Variables

Create or update `backend/.env`:

```bash
# Required for MCP server
MCP_API_TOKEN=your-secure-token-here
ENABLE_MCP_WRITES=true  # Enable write tools (set to false for read-only)
MCP_ACTOR_NAME=claude_code_user

# Optional: Rate limiting
MCP_RATE_LIMIT_RPM=60

# Optional: Path controls
MCP_ALLOWED_REPO_ROOTS=backend,repo-b,docs,scripts
MCP_DENY_GLOBS=.env,.env.*,**/.env,**/.env.*,**/node_modules/**,**/.git/**

# Database (required for db.upsert and backend API)
DATABASE_URL=postgresql://user:pass@host:port/dbname

# Supabase (optional, for document management)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 2. Test the MCP Server

Run smoke tests to verify all tools are working:

```bash
# Activate backend venv
cd backend
source .venv/bin/activate

# Run smoke tests
python tests/test_mcp_smoke.py

# Or use pytest
pytest tests/test_mcp_smoke.py -v
```

## Connecting Claude Code

### Configuration File

Claude Code uses MCP servers configured in Codex CLI's config file.

#### Location
- The config file is already present at: `.codex/config.toml`

#### Verify Configuration

Check that the Business Machine MCP server is configured:

```toml
[mcp_servers.business_machine]
command = "./scripts/run_mcp_server.sh"
cwd = "."
env_vars = [
  "MCP_API_TOKEN",
  "ENABLE_MCP_WRITES",
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MCP_ACTOR_NAME",
  "MCP_RATE_LIMIT_RPM",
  "MCP_ALLOWED_REPO_ROOTS",
  "MCP_DENY_GLOBS",
]
startup_timeout_sec = 15
tool_timeout_sec = 60
```

### Start Using MCP Tools

Once configured, Claude Code will automatically discover and use the MCP server. You can verify by asking:

```
Can you list the available Business Machine MCP tools?
```

## Tool Reference

### Environment Tools

#### `env.get`
Get environment variable status or value.

**Inputs:**
- `key` (string): Environment variable key
- `scope` (enum): `backend/.env`, `repo-b/.env.local`, or `process`
- `reveal` (bool): If true, return actual value (default: false, returns only status)

**Example:**
```json
{
  "key": "DATABASE_URL",
  "scope": "backend/.env",
  "reveal": false
}
```

**Security:** Never reveals secrets by default. Values are redacted if they look sensitive.

#### `env.set`
Set environment variable in file or process scope.

**Inputs:**
- `key` (string): Environment variable key
- `value` (string): Value to set
- `scope` (enum): `backend/.env`, `repo-b/.env.local`, or `process`
- `confirm` (bool): Must be true to execute

**Example:**
```json
{
  "key": "NEXT_PUBLIC_API_BASE_URL",
  "value": "http://localhost:8000",
  "scope": "repo-b/.env.local",
  "confirm": true
}
```

**Security:** Never echoes values in logs. Preserves file formatting.

### Git Tools

#### `git.diff`
Get git diff output with optional path filtering.

**Inputs:**
- `target` (string): Git target to diff against (default: "HEAD")
- `paths` (array): Optional file paths to limit scope
- `staged` (bool): If true, show only staged changes

**Example:**
```json
{
  "target": "main",
  "paths": ["repo-b/src/**"],
  "staged": false
}
```

#### `git.commit`
Stage and commit changes with a message.

**Inputs:**
- `message` (string): Commit message
- `add_paths` (array): Paths to stage (empty = stage all tracked changes)
- `confirm` (bool): Must be true to execute

**Example:**
```json
{
  "message": "Add new authentication flow",
  "add_paths": ["repo-b/src/app/auth/**"],
  "confirm": true
}
```

**Note:** Adds co-author attribution automatically. Does not push to remote.

### Frontend Tools

#### `fe.edit`
Apply edits to frontend files (currently returns suggestions for manual editing).

**Inputs:**
- `files` (array): File paths relative to `repo-b/src/`
- `instructions` (string): Natural language editing instructions
- `confirm` (bool): Must be true

**Path Sandbox:** Only allows `repo-b/src/`, `repo-b/app/`, `repo-b/public/`

**Note:** This is a placeholder. For actual file editing, use `codex.task`.

#### `fe.run`
Run frontend command presets.

**Inputs:**
- `command_preset` (enum): `lint`, `test`, `typecheck`, `dev`, or `build`
- `timeout_sec` (int): Timeout in seconds (default: 60)

**Example:**
```json
{
  "command_preset": "typecheck",
  "timeout_sec": 30
}
```

### API Tools

#### `api.call`
Make HTTP calls to local backend API.

**Inputs:**
- `method` (enum): `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
- `path` (string): API path (must start with `/api/`)
- `json_body` (object): JSON request body
- `query_params` (object): Query parameters
- `timeout_sec` (int): Timeout in seconds (default: 10)

**Example:**
```json
{
  "method": "GET",
  "path": "/api/health",
  "json_body": {},
  "query_params": {},
  "timeout_sec": 10
}
```

**Security:** Allowlisted paths only. Assumes backend runs on localhost:8000.

### Database Tools

#### `db.upsert`
Upsert records into database tables via backend API.

**Inputs:**
- `table` (string): Table name (must be in allowlist)
- `records` (array): List of record objects to upsert
- `conflict_keys` (array): Column names for ON CONFLICT clause
- `dry_run` (bool): If true, validate but don't execute (default: true)
- `confirm` (bool): Must be true when `dry_run=false`

**Example:**
```json
{
  "table": "businesses",
  "records": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "Acme Corp",
      "industry": "Technology"
    }
  ],
  "conflict_keys": ["id"],
  "dry_run": false,
  "confirm": true
}
```

**Security:**
- Allowlisted tables: `businesses`, `departments`, `capabilities`, `documents`, `executions`, `work_items`
- Never logs full payloads
- Requires backend running on localhost:8000

### Codex Tools

#### `codex.task`
Delegate a task to Codex CLI (OpenAI Codex).

**Inputs:**
- `prompt` (string): Natural language task prompt
- `mode` (enum): `plan_only` (safe) or `apply_changes` (writes files)
- `cwd` (string): Working directory relative to repo root (default: ".")
- `files` (array): File globs Codex is allowed to read/write
- `timeout_sec` (int): Timeout in seconds (default: 120)
- `confirm` (bool): Must be true when `mode=apply_changes`

**Example:**
```json
{
  "prompt": "Update the login page to use the new auth API endpoint",
  "mode": "apply_changes",
  "cwd": ".",
  "files": ["repo-b/src/app/**"],
  "timeout_sec": 120,
  "confirm": true
}
```

**Security:**
- File allowlist enforced
- Returns diff of changes
- Adds constraints about no secrets, no network calls

## Task Flow Examples

### Example 1: Add Environment Variable

```json
{
  "tool": "env.set",
  "input": {
    "key": "NEXT_PUBLIC_API_BASE_URL",
    "value": "http://localhost:8000",
    "scope": "repo-b/.env.local",
    "confirm": true
  }
}
```

### Example 2: Create Seed Business Record

```json
{
  "tool": "db.upsert",
  "input": {
    "table": "businesses",
    "records": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "name": "Demo Business",
        "industry": "Consulting"
      }
    ],
    "conflict_keys": ["id"],
    "dry_run": false,
    "confirm": true
  }
}
```

### Example 3: Modify Frontend with Codex

```json
{
  "tool": "codex.task",
  "input": {
    "prompt": "Add a Documents link to the top navigation bar in the main layout",
    "mode": "apply_changes",
    "cwd": ".",
    "files": ["repo-b/src/app/**", "repo-b/src/components/**"],
    "timeout_sec": 120,
    "confirm": true
  }
}
```

### Example 4: Run Linter and Tests

```json
[
  {
    "tool": "fe.run",
    "input": {
      "command_preset": "lint",
      "timeout_sec": 60
    }
  },
  {
    "tool": "fe.run",
    "input": {
      "command_preset": "typecheck",
      "timeout_sec": 60
    }
  }
]
```

## Security & Best Practices

### Secret Management
- **Never** commit `.env` or `.env.local` files
- Use `env.get` with `reveal=false` (default) to check status without exposing values
- All secret-looking values are automatically redacted in logs

### Path Sandboxing
- File operations are restricted to allowlisted directories
- Default allowed: `backend`, `repo-b`, `docs`, `scripts`
- Denied patterns: `.env*`, `node_modules`, `.git`

### Write Operations
- All write tools require `confirm=true`
- Set `ENABLE_MCP_WRITES=true` in environment
- Use `dry_run=true` (where supported) to preview changes

### Rate Limiting
- Default: 60 requests per minute
- Configure with `MCP_RATE_LIMIT_RPM`

## Troubleshooting

### MCP Server Won't Start

**Error:** `MCP_API_TOKEN is not set`
- **Solution:** Set `MCP_API_TOKEN` in `backend/.env`

**Error:** `No Python venv found`
- **Solution:** Create venv: `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`

### Tool Execution Errors

**Error:** `Write tool blocked: ENABLE_MCP_WRITES is not true`
- **Solution:** Set `ENABLE_MCP_WRITES=true` in `backend/.env`

**Error:** `Path not allowed`
- **Solution:** Check `MCP_ALLOWED_REPO_ROOTS` and `MCP_DENY_GLOBS` settings

**Error:** `Could not connect to backend`
- **Solution:** Start backend server: `cd backend && uvicorn app.main:app --reload`

### Codex CLI Not Found

**Error:** `Codex CLI not found`
- **Solution:** Install Codex CLI from https://developers.openai.com/codex/cli/
- Verify installation: `which codex`

## Advanced Configuration

### Custom Repo Roots

```bash
MCP_ALLOWED_REPO_ROOTS=backend,repo-b,repo-c,custom-service
```

### Custom Deny Patterns

```bash
MCP_DENY_GLOBS=.env,.env.*,**/.env,**/.env.*,**/node_modules/**,**/.git/**,**/secrets/**
```

### Increase Rate Limit

```bash
MCP_RATE_LIMIT_RPM=120  # 2 requests per second
```

## Testing

### Run All Smoke Tests

```bash
cd backend
source .venv/bin/activate
pytest tests/test_mcp_smoke.py -v
```

### Test Individual Tools

```bash
# Test env.get
python -c "
from app.mcp.tools.env_tools import register_env_tools, _env_get
from app.mcp.auth import McpContext
from app.mcp.schemas.env_tools import EnvGetInput

register_env_tools()
ctx = McpContext(actor='test', token_valid=True)
result = _env_get(ctx, EnvGetInput(key='PATH', scope='process', reveal=False))
print(result)
"
```

## Support

For issues or questions:
- File an issue at: https://github.com/anthropics/claude-code/issues
- Check logs in: `backend/logs/` (if configured)
- Review audit trail in database: `audit_events` table

## References

- [Claude Code Documentation](https://code.claude.com/docs/)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Codex CLI Documentation](https://developers.openai.com/codex/cli/)
