"""Celery bootstrap for async finance runs.

Celery is optional at import time to keep local/test startup lightweight.
"""

from __future__ import annotations

import os

try:
    from celery import Celery
except Exception:  # pragma: no cover - optional dependency
    Celery = None


def create_celery_app():
    if Celery is None:
        return None

    broker_url = os.getenv("FIN_CELERY_BROKER_URL", os.getenv("REDIS_URL", "redis://localhost:6379/1"))
    result_backend = os.getenv("FIN_CELERY_RESULT_BACKEND", broker_url)

    app = Celery(
        "business_os_finance",
        broker=broker_url,
        backend=result_backend,
    )
    app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        task_default_queue="finance",
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        task_time_limit=1800,
    )
    return app


celery_app = create_celery_app()
