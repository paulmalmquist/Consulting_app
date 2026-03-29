"""Optional async task hooks for the execution layer."""

from __future__ import annotations

import os

try:
    from celery import Celery
except Exception:  # pragma: no cover
    Celery = None


_celery_app = None
if Celery is not None:  # pragma: no branch
    broker_url = os.getenv("TRADES_CELERY_BROKER_URL", os.getenv("REDIS_URL", "redis://localhost:6379/2"))
    backend_url = os.getenv("TRADES_CELERY_RESULT_BACKEND", broker_url)
    _celery_app = Celery("business_os_trades", broker=broker_url, backend=backend_url)
    _celery_app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        task_default_queue="trades",
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        task_time_limit=900,
    )


if _celery_app is not None:  # pragma: no cover

    @_celery_app.task(bind=True, max_retries=3, autoretry_for=(Exception,))
    def broker_heartbeat(self, business_id: str):
        return {"accepted": True, "task": "broker_heartbeat", "business_id": business_id}

    @_celery_app.task(bind=True, max_retries=3, autoretry_for=(Exception,))
    def sync_open_orders(self, business_id: str):
        return {"accepted": True, "task": "sync_open_orders", "business_id": business_id}

    @_celery_app.task(bind=True, max_retries=3, autoretry_for=(Exception,))
    def reconcile_fills(self, business_id: str):
        return {"accepted": True, "task": "reconcile_fills", "business_id": business_id}

    @_celery_app.task(bind=True, max_retries=3, autoretry_for=(Exception,))
    def sync_positions(self, business_id: str):
        return {"accepted": True, "task": "sync_positions", "business_id": business_id}

    @_celery_app.task(bind=True, max_retries=3, autoretry_for=(Exception,))
    def evaluate_alerts(self, business_id: str):
        return {"accepted": True, "task": "evaluate_alerts", "business_id": business_id}
