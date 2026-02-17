# ── Consulting App Makefile ────────────────────────────────────────
.PHONY: dev dev-bos dev-demo test test-backend test-demo test-e2e \
        lint fmt db\:migrate db\:seed db\:dry db\:verify install \
        bmctl smoke mcp-smoke command-regression public-walloff-smoke

# ── Ports ──────────────────────────────────────────────────────────
BACKEND_PORT   ?= 8000
DEMO_LAB_PORT  ?= 8001
FRONTEND_PORT  ?= 3001
BACKEND_HOST   ?= 127.0.0.1

# ── Install ────────────────────────────────────────────────────────
install:  ## Install all dependencies
	cd backend && python3 -m venv .venv && .venv/bin/pip install --upgrade pip && .venv/bin/pip install -r requirements.txt
	cd repo-c  && python3 -m venv .venv && .venv/bin/pip install --upgrade pip && .venv/bin/pip install -r requirements.txt
	cd repo-b  && npm ci

# ── Dev ────────────────────────────────────────────────────────────
dev:  ## Start all services (Business OS + Demo Lab + Frontend)
	./dev.sh

dev-bos:  ## Start Business OS backend + Frontend
	DEMO_LAB_PORT=0 ./dev.sh

dev-demo:  ## Start Demo Lab backend + Frontend
	BACKEND_PORT=0 ./dev.sh

# ── Test ───────────────────────────────────────────────────────────
test: test-backend test-demo  ## Run all tests

test-backend:  ## Run Business OS backend tests
	cd backend && .venv/bin/python -m pytest tests/ -v

test-demo:  ## Run Demo Lab backend tests
	cd repo-c && .venv/bin/python -m pytest tests/ -v

test-e2e:  ## Run Playwright E2E tests
	cd repo-b && npx playwright test

# ── Lint / Format ─────────────────────────────────────────────────
lint:  ## Lint all code
	cd backend && .venv/bin/python -m ruff check app/ tests/ || true
	cd repo-c  && .venv/bin/python -m ruff check app/ tests/ || true
	cd repo-b  && npx next lint || true

fmt:  ## Format all code
	cd backend && .venv/bin/python -m ruff format app/ tests/ || true
	cd repo-c  && .venv/bin/python -m ruff format app/ tests/ || true

# ── Database ──────────────────────────────────────────────────────
db\:migrate:  ## Apply DB migrations (backbone + business_os)
	cd repo-b && NODE_TLS_REJECT_UNAUTHORIZED=0 node db/schema/apply.js

db\:dry:  ## Dry-run DB migrations
	cd repo-b && node db/schema/apply.js --dry-run

db\:verify:  ## Verify DB schema
	cd repo-b && NODE_TLS_REJECT_UNAUTHORIZED=0 node db/schema/verify.js

db\:seed:  ## Seed database with sample data
	cd repo-b && NODE_TLS_REJECT_UNAUTHORIZED=0 node db/schema/apply.js

db\:test:  ## Run DB schema integration tests
	cd repo-b && NODE_TLS_REJECT_UNAUTHORIZED=0 node db/tests/schema.test.js

# ── Control CLI ──────────────────────────────────────────────────
bmctl:  ## Run bmctl control CLI (pass ARGS="lab env list")
	./scripts/bmctl $(ARGS)

smoke:  ## Smoke-test all local services via bmctl
	./scripts/bmctl health

mcp-smoke:  ## Smoke-test command orchestrator plan/confirm/execute lifecycle
	./scripts/mcp_smoke_test.sh http://127.0.0.1:$(FRONTEND_PORT)

command-regression:  ## Regression tests for delete-by-name command lifecycle
	./scripts/command_orchestrator_regression.sh http://127.0.0.1:$(FRONTEND_PORT)

public-walloff-smoke:  ## Smoke-test public/private wall-off boundaries and public APIs
	./scripts/public_walloff_smoke_test.sh http://127.0.0.1:$(FRONTEND_PORT)

# ── Help ──────────────────────────────────────────────────────────
help:  ## Show this help
	@grep -E '^[a-zA-Z_:/-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
