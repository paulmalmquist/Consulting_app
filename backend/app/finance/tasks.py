"""Celery tasks for long-running deterministic finance runs."""

from __future__ import annotations

from .celery_app import celery_app


if celery_app is not None:  # pragma: no cover - runtime integration path

    @celery_app.task(bind=True, max_retries=3, autoretry_for=(Exception,))
    def run_finance_job(self, payload: dict):
        # Task body is intentionally thin; API service remains the authority.
        return {"accepted": True, "payload": payload}
