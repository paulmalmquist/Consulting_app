# ── Consulting App Makefile ────────────────────────────────────────
.PHONY: dev dev-bos dev-demo test test-backend test-demo test-frontend test-e2e test-repe-backend test-repe-unit test-repe-e2e test-repe \
        test-live test-dashboard-validation test-dashboard-live test-dashboard-report \
        lint lint-strict typecheck quality fmt db\:migrate db\:migrate\:prod db\:seed db\:dry db\:verify install \
        bmctl smoke mcp-smoke command-regression public-walloff-smoke \
        orchestration\:install-hooks orchestration\:validate orchestration\:verify-logs \
        perf\:smoke perf\:baseline perf\:nightly \
        verify-backend verify-finance verify-api verify-ui verify-ai verify-all

# ── Ports ──────────────────────────────────────────────────────────
BACKEND_PORT   ?= 8000
FRONTEND_PORT  ?= 3001
BACKEND_HOST   ?= 127.0.0.1

# ── Install ────────────────────────────────────────────────────────
install:  ## Install all dependencies
	cd backend && python3 -m venv .venv && .venv/bin/pip install --upgrade pip && .venv/bin/pip install -r requirements.txt
	cd repo-b  && npm ci

# ── Dev ────────────────────────────────────────────────────────────
dev:  ## Start canonical backend + frontend
	./dev.sh

dev-bos:  ## Start canonical backend + frontend
	./dev.sh

dev-demo:  ## Legacy alias: start lab UI on the canonical backend
	./dev.sh

# ── Test ───────────────────────────────────────────────────────────
test: test-backend  ## Run canonical backend tests

test-backend:  ## Run Business OS backend tests
	cd backend && .venv/bin/python -m pytest tests/ -v

test-demo:  ## Legacy alias: run Demo Lab compatibility tests in backend
	cd backend && .venv/bin/python -m pytest tests/test_lab_v1.py tests/test_lab_v1_compat.py -q

test-frontend:  ## Run frontend unit tests
	cd repo-b && npm run test:unit

test-e2e:  ## Run Playwright E2E tests
	cd repo-b && npx playwright test

test-repe-backend: ## Run REPE backend API tests with logging artifacts
	cd backend && .venv/bin/python -m pytest tests/test_finance_repe_api.py -q

test-repe-unit: ## Run REPE frontend unit tests
	cd repo-b && npm run test:unit

test-repe-e2e: ## Run REPE Playwright flows
	cd repo-b && npm run test:repe:e2e

test-repe: test-repe-backend test-repe-unit test-repe-e2e ## Run full REPE verification suite

test-dashboard-validation:  ## Run dashboard validation spec + layout tests (no DB needed)
	cd backend && .venv/bin/python -m pytest tests/dashboard_validation/ -v --ignore=tests/dashboard_validation/test_data_reachability.py

test-dashboard-live:  ## Run dashboard validation with live DB (requires DATABASE_URL)
	@if [ -z "$$DATABASE_URL" ]; then \
	  echo "ERROR: DATABASE_URL is not set."; \
	  exit 1; \
	fi
	cd backend && DATABASE_URL="$$DATABASE_URL" .venv/bin/python -m pytest tests/dashboard_validation/ -v -m live

test-dashboard-report:  ## Generate dashboard validation report (JSON + Markdown)
	cd backend && .venv/bin/python -m tests.dashboard_validation.report_generator

test-live:  ## Run live integration smoke tests against a real DB (requires DATABASE_URL)
	@if [ -z "$$DATABASE_URL" ]; then \
	  echo "ERROR: DATABASE_URL is not set. Example:"; \
	  echo "  DATABASE_URL=postgresql://user:pass@host:5432/db make test-live"; \
	  exit 1; \
	fi
	cd backend && DATABASE_URL="$$DATABASE_URL" .venv/bin/python -m pytest tests/test_re_live.py -v

# ── Lint / Format ─────────────────────────────────────────────────
lint:  ## Lint all code
	cd backend && .venv/bin/python -m ruff check app/ tests/
	cd repo-b  && npm run lint

lint-strict:  ## Lint all code (fails on violations)
	cd backend && .venv/bin/python -m ruff check app/ tests/
	cd repo-b  && npm run lint

typecheck:  ## Typecheck frontend code
	cd repo-b && npm run typecheck

quality: lint-strict typecheck test-frontend  ## CI-aligned strict checks

fmt:  ## Format all code
	cd backend && .venv/bin/python -m ruff format app/ tests/

# ── Database ──────────────────────────────────────────────────────
db\:migrate:  ## Apply DB migrations (backbone + business_os)
	cd repo-b && NODE_TLS_REJECT_UNAUTHORIZED=0 node db/schema/apply.js

db\:migrate\:prod:  ## Apply DB migrations to production (requires DATABASE_URL)
	@test -n "$$DATABASE_URL" || (echo "ERROR: DATABASE_URL not set. Export it or source backend/.env first." && exit 1)
	cd repo-b && NODE_TLS_REJECT_UNAUTHORIZED=0 node db/schema/apply.js
	cd repo-b && NODE_TLS_REJECT_UNAUTHORIZED=0 node db/schema/verify.js
	@echo "Production migrations applied and verified."

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

orchestration\:install-hooks: ## Install protected-branch git hooks
	./scripts/install_orchestration_hooks.sh

orchestration\:validate: ## Validate orchestration contracts + tests
	cd backend && .venv/bin/python -m pytest tests/test_orchestration_*.py -q

orchestration\:verify-logs: ## Verify orchestration log hash chain
	python3 scripts/codex_orchestrator.py log verify-chain

# ── Help ──────────────────────────────────────────────────────────
help:  ## Show this help
	@grep -E '^[a-zA-Z_:/-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help

# ── Performance ───────────────────────────────────────────────────
perf\:smoke: ## Run local backend query performance smoke suite (AI + metrics)
	./backend/perf/scripts/run_local.sh

perf\:baseline: ## Re-run local smoke three times and build baseline medians
	rm -rf artifacts/perf/baseline
	for i in 1 2 3; do ARTIFACT_ROOT=artifacts/perf/baseline/r$$i RUN_LABEL=baseline SKIP_SEED=$$([ $$i -gt 1 ] && echo 1 || echo 0) ./backend/perf/scripts/run_local.sh; done
	python3 backend/perf/scripts/summarize.py baseline-build --scenario ai_S_smoke_5_mixed_lookup --inputs artifacts/perf/baseline/r1/ai_S_smoke_5_mixed_lookup/report.json artifacts/perf/baseline/r2/ai_S_smoke_5_mixed_lookup/report.json artifacts/perf/baseline/r3/ai_S_smoke_5_mixed_lookup/report.json --output backend/perf/baselines/ai_S_smoke_5_mixed_lookup.json
	python3 backend/perf/scripts/summarize.py baseline-build --scenario ai_S_smoke_5_mixed_decision_support --inputs artifacts/perf/baseline/r1/ai_S_smoke_5_mixed_decision_support/report.json artifacts/perf/baseline/r2/ai_S_smoke_5_mixed_decision_support/report.json artifacts/perf/baseline/r3/ai_S_smoke_5_mixed_decision_support/report.json --output backend/perf/baselines/ai_S_smoke_5_mixed_decision_support.json
	python3 backend/perf/scripts/summarize.py baseline-build --scenario metrics_S_smoke_5_none --inputs artifacts/perf/baseline/r1/metrics_S_smoke_5_none/report.json artifacts/perf/baseline/r2/metrics_S_smoke_5_none/report.json artifacts/perf/baseline/r3/metrics_S_smoke_5_none/report.json --output backend/perf/baselines/metrics_S_smoke_5_none.json

perf\:nightly: ## Run full backend query performance matrix + soak profiles
	./backend/perf/scripts/run_nightly.sh

# ── Verification (Truth Parity) ───────────────────────────────────
verify-backend:  ## Schema + endpoint contract tests
	cd backend && python -m pytest tests/test_re_env_portfolio.py tests/test_pds_v2_routes.py -x --tb=short -q

verify-finance:  ## Python metric parity unit tests
	cd backend && python -m pytest tests/ -k "portfolio or fund_table or query_resolver" -x --tb=short -q

verify-api:  ## Cross-layer SQL vs Python vs API reconciliation
	python verification/runners/run_spec.py verification/specs/query_resolver.yaml --quarter 2026Q2

verify-ui:  ## Placeholder for Playwright interaction + value extraction tests
	@echo "Playwright tests not yet configured. Run: npx playwright test"

verify-ai:  ## Placeholder for conversational parity tests
	@echo "AI verification not yet configured."

verify-all: verify-backend verify-finance verify-api  ## Full verification suite
	@echo "All verification targets complete."
