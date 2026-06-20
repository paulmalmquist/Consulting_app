"""FOMC text connector — fetch + normalize public Federal Reserve statement text.

TEXT ONLY. This connector does NOT embed, summarize, classify hawkish/dovish, or
score semantic shift. The text→embedding step is a separate, deferred materializer
with a deterministic fixture fallback.
"""
