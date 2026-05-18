# Architecture Inventory — [Environment]

**Last updated:** YYYY-MM-DD  
**Verified against:** [git commit or date]

## Frontend map

### Routes
| Route | File | Purpose |
|---|---|---|
| `/lab/env/[envId]/[path]` | `repo-b/src/app/lab/env/[envId]/[path]/page.tsx` | (purpose) |

### Key components
| Component | File | Purpose |
|---|---|---|
| (name) | `repo-b/src/components/...` | (purpose) |

### API clients / hooks
| Client / Hook | File | Calls |
|---|---|---|
| (name) | `repo-b/src/lib/...` | (endpoint) |

## Backend map

### Routes
| Method | Endpoint | File | Purpose |
|---|---|---|---|
| GET | `/api/v1/[path]` | `backend/app/routes/[file].py` | (purpose) |

### Services
| Service | File | Purpose |
|---|---|---|
| (name) | `backend/app/services/[file].py` | (purpose) |

### Schemas
| Schema | File | Used by |
|---|---|---|
| (name) | `backend/app/schemas/[file].py` | (routes) |

## Data map

### Tables
| Table | Migration | RLS | Purpose |
|---|---|---|---|
| (name) | `repo-b/db/schema/NNN_*.sql` | Yes/No | (purpose) |

### Views / Functions
| Name | Location | Purpose |
|---|---|---|
| (name) | (file or Supabase) | (purpose) |

## AI / MCP / Runtime map

### MCP tools
| Tool | File | Purpose |
|---|---|---|
| (name) | `backend/app/mcp/tools/...` | (purpose) |

### Assistant runtime
| Component | File | Purpose |
|---|---|---|
| (name) | `backend/app/assistant_runtime/...` | (purpose) |

## Test map

### Unit tests
| Test file | What it covers |
|---|---|
| `backend/tests/test_[name].py` | (coverage) |

### Integration tests
| Test file | What it covers |
|---|---|
| `tests/...` | (coverage) |

### Smoke / health checks
| Script | Command |
|---|---|
| (name) | `python scripts/...` |

## Needs verification
- [ ] (item that requires repo inspection to confirm)
- [ ] (item that requires browser verification)
