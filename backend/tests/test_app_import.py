"""Regression guard: the FastAPI app must import from a clean checkout.

A stray `from app.routes import hr_polymarket` line once rode into an unrelated
commit while the route module was untracked, so `from app.main import app` raised
ModuleNotFoundError on any fresh checkout and pytest collection died before a single
test ran. This test fails loudly if main.py ever imports a route/service module that
isn't actually present in the tree.

Run with: cd backend && python -m pytest tests/test_app_import.py -q
"""
import os

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")


def test_app_main_imports_cleanly():
    from app.main import app

    # If the import above resolved, every `from app.routes import X` in main.py
    # pointed at a real module. Sanity-check the app object is wired.
    assert app is not None
    assert len(app.routes) > 0
