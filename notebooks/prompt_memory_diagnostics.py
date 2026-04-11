"""Helper module for prompt_memory_diagnostics.ipynb.

This module keeps the notebook cells short and readable. It holds:

- CSV / DB loading with defensive JSON parsing
- A prompt assembly simulator that mirrors the Winston gateway layout
- Rough token estimation
- Memory-failure classification heuristics
- Sensitivity experiment runners for page name, entity label, history depth,
  RAG inclusion, and token cap

Nothing here is expected to exactly match the production gateway byte-for-byte.
The goal is a diagnostic lab: show how prompt composition *would* change under
different inputs so you can reason about memory loss, deictic resolution, and
phrasing drift.

All functions are defensive — messy CSV exports, missing columns, broken JSON,
and absent optional tables are all handled without raising.
"""

from __future__ import annotations

import json
import math
import os
import re
import textwrap
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import pandas as pd


# ---------------------------------------------------------------------------
# Constants and defaults
# ---------------------------------------------------------------------------

DEFAULT_DATA_DIR = Path("./data")

EXPECTED_FILES = {
    "conversations": "ai_conversations_rows.csv",
    "messages": "ai_messages_rows.csv",
    "gateway_logs": "ai_gateway_logs_rows.csv",
    "prompt_receipts": "ai_prompt_receipts_rows.csv",
}

# Rough token estimator: ~4 characters per token is a reasonable upper bound
# for English prose going through cl100k-like tokenizers. This is intentionally
# an estimate — the notebook is for shape, not billing.
CHARS_PER_TOKEN = 4.0

DEICTIC_PHRASES = [
    "this fund",
    "this deal",
    "this asset",
    "this page",
    "this model",
    "this environment",
    "current environment",
    "current deal",
    "current model",
    "current fund",
    "here",
    "above",
    "that one",
]


# ---------------------------------------------------------------------------
# Safe parsing helpers
# ---------------------------------------------------------------------------

def safe_json(value: Any) -> Any:
    """Parse a value as JSON, tolerating None, NaN, already-parsed dicts, and
    malformed strings. Returns None on failure so downstream code can branch."""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, float) and math.isnan(value):
        return None
    if not isinstance(value, str):
        return None
    s = value.strip()
    if not s or s.lower() in {"null", "nan", "none"}:
        return None
    try:
        return json.loads(s)
    except Exception:
        # psql json exports sometimes double-escape
        try:
            return json.loads(s.replace('""', '"'))
        except Exception:
            return None


def safe_ts(value: Any) -> Optional[pd.Timestamp]:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    try:
        return pd.to_datetime(value, utc=True, errors="coerce")
    except Exception:
        return None


def estimate_tokens(text: Optional[str]) -> int:
    if not text:
        return 0
    if not isinstance(text, str):
        text = str(text)
    return max(1, int(math.ceil(len(text) / CHARS_PER_TOKEN)))


def truncate_preview(text: Optional[str], n: int = 600) -> str:
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)
    text = text.strip()
    if len(text) <= n:
        return text
    return text[:n].rstrip() + f"\n... [+{len(text) - n} chars truncated]"


def boxed(title: str, body: str, width: int = 88) -> str:
    """Return a text box for readable prompt-section previews in notebooks."""
    line = "─" * width
    head = f"┌{line}┐\n│ {title:<{width - 2}} │\n├{line}┤"
    wrapped_lines: List[str] = []
    for raw_line in (body or "").splitlines() or [""]:
        if not raw_line:
            wrapped_lines.append("")
            continue
        for chunk in textwrap.wrap(
            raw_line,
            width=width - 2,
            drop_whitespace=False,
            replace_whitespace=False,
        ) or [""]:
            wrapped_lines.append(chunk)
    body_block = "\n".join(f"│ {ln:<{width - 2}} │" for ln in wrapped_lines)
    tail = f"\n└{line}┘"
    return f"{head}\n{body_block}{tail}"


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

@dataclass
class LoadedData:
    conversations: pd.DataFrame
    messages: pd.DataFrame
    gateway_logs: pd.DataFrame
    prompt_receipts: pd.DataFrame
    source: str  # "csv", "db", "synthetic"
    notes: List[str] = field(default_factory=list)


def _empty_frame(columns: Sequence[str]) -> pd.DataFrame:
    return pd.DataFrame({c: pd.Series(dtype="object") for c in columns})


def load_from_csv(data_dir: Path | str = DEFAULT_DATA_DIR) -> LoadedData:
    """Load the four expected CSVs, tolerating missing files."""
    data_dir = Path(data_dir)
    notes: List[str] = []

    def _read(name: str, fallback_cols: Sequence[str]) -> pd.DataFrame:
        path = data_dir / name
        if not path.exists():
            notes.append(f"missing file: {path.name} (using empty frame)")
            return _empty_frame(fallback_cols)
        try:
            df = pd.read_csv(path, low_memory=False)
            notes.append(f"loaded {path.name}: {len(df):,} rows")
            return df
        except Exception as exc:
            notes.append(f"failed to read {path.name}: {exc}")
            return _empty_frame(fallback_cols)

    conv_cols = [
        "conversation_id", "business_id", "env_id", "title", "created_at",
        "updated_at", "archived", "actor", "thread_kind", "scope_type",
        "scope_id", "scope_label", "launch_source", "context_summary",
        "last_route",
    ]
    msg_cols = [
        "message_id", "conversation_id", "role", "content", "tool_calls",
        "citations", "token_count", "created_at",
    ]
    log_cols = [
        "id", "conversation_id", "session_id", "business_id", "env_id",
        "actor", "message_preview", "route_lane", "route_model", "is_write",
        "prompt_tokens", "completion_tokens", "cached_tokens",
        "tool_call_count", "rag_chunks_raw", "rag_chunks_used",
        "elapsed_ms", "ttft_ms", "fallback_used", "error_message",
        "timings_json", "prompt_audit_json", "matched_pattern", "created_at",
    ]
    receipt_cols = [
        "receipt_id", "conversation_id", "request_id", "created_at",
        "system_prompt", "context_block", "visible_context", "rag_block",
        "history_json", "current_user_message", "lane", "model",
        "scope_type", "scope_id", "scope_label", "env_name", "business_name",
        "page_name", "module_name", "total_prompt_tokens",
        "section_tokens_json", "history_included", "truncated",
    ]

    conversations = _read(EXPECTED_FILES["conversations"], conv_cols)
    messages = _read(EXPECTED_FILES["messages"], msg_cols)
    gateway_logs = _read(EXPECTED_FILES["gateway_logs"], log_cols)
    prompt_receipts = _read(EXPECTED_FILES["prompt_receipts"], receipt_cols)

    for df, ts_cols in [
        (conversations, ["created_at", "updated_at"]),
        (messages, ["created_at"]),
        (gateway_logs, ["created_at"]),
        (prompt_receipts, ["created_at"]),
    ]:
        for col in ts_cols:
            if col in df.columns:
                df[col] = df[col].apply(safe_ts)

    return LoadedData(
        conversations=conversations,
        messages=messages,
        gateway_logs=gateway_logs,
        prompt_receipts=prompt_receipts,
        source="csv",
        notes=notes,
    )


def try_load_from_db() -> Optional[LoadedData]:
    """Optional live DB mode. Returns None if no DATABASE_URL or psycopg is
    available. Safe to call; never raises."""
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        return None
    try:
        import psycopg  # type: ignore
    except Exception:
        try:
            import psycopg2 as psycopg  # type: ignore
        except Exception:
            return None

    notes = [f"using DATABASE_URL ({db_url.split('@')[-1]})"]
    try:
        with psycopg.connect(db_url) as conn:  # type: ignore
            def q(sql: str) -> pd.DataFrame:
                try:
                    return pd.read_sql(sql, conn)
                except Exception as exc:
                    notes.append(f"query failed: {exc}")
                    return pd.DataFrame()

            conversations = q(
                "SELECT * FROM ai_conversations ORDER BY updated_at DESC LIMIT 2000"
            )
            messages = q(
                "SELECT * FROM ai_messages ORDER BY created_at DESC LIMIT 20000"
            )
            gateway_logs = q(
                "SELECT * FROM ai_gateway_logs ORDER BY created_at DESC LIMIT 5000"
            )
            prompt_receipts = q(
                "SELECT * FROM ai_prompt_receipts ORDER BY created_at DESC LIMIT 5000"
            )
    except Exception as exc:
        notes.append(f"db connect failed: {exc}")
        return None

    return LoadedData(
        conversations=conversations,
        messages=messages,
        gateway_logs=gateway_logs,
        prompt_receipts=prompt_receipts,
        source="db",
        notes=notes,
    )


def make_synthetic() -> LoadedData:
    """Synthetic data so the notebook is runnable end-to-end even without an
    export. The shapes mirror the real schema but values are toy."""
    now = pd.Timestamp.utcnow()
    conv_rows = [
        {
            "conversation_id": "c-001",
            "business_id": "b-meridian",
            "env_id": "env-meridian",
            "title": "Meridian Value Fund I review",
            "created_at": now - pd.Timedelta(hours=3),
            "updated_at": now - pd.Timedelta(minutes=10),
            "archived": False,
            "actor": "paul",
            "thread_kind": "fund_detail",
            "scope_type": "fund",
            "scope_id": "fund-mvf1",
            "scope_label": "Meridian Value Fund I",
            "launch_source": "fund_detail_page",
            "context_summary": "User is reviewing Meridian Value Fund I returns",
            "last_route": "B",
        },
        {
            "conversation_id": "c-002",
            "business_id": "b-stone",
            "env_id": "env-stone",
            "title": "Stone PDS portfolio check",
            "created_at": now - pd.Timedelta(hours=1),
            "updated_at": now - pd.Timedelta(minutes=3),
            "archived": False,
            "actor": "paul",
            "thread_kind": "general",
            "scope_type": None,
            "scope_id": None,
            "scope_label": None,
            "launch_source": "command_bar",
            "context_summary": None,
            "last_route": "A",
        },
    ]
    msg_rows = [
        # Conversation 1 — fund detail
        ("c-001", "user", "What is the current TVPI for this fund?", 12),
        ("c-001", "assistant", "Meridian Value Fund I shows TVPI 1.42x as of 2025-Q4.", 18),
        ("c-001", "user", "And the IRR?", 4),
        ("c-001", "assistant", "Net IRR is 11.8%, gross IRR 14.2%.", 14),
        ("c-001", "user", "Should we sell this asset?", 8),
        ("c-001", "assistant", "I don't have a specific asset in scope — can you clarify which one?", 20),
        # Conversation 2 — generic
        ("c-002", "user", "How many funds are there?", 7),
        ("c-002", "assistant", "Across the Stone PDS environment, there are 3 active funds.", 16),
        ("c-002", "user", "What is going on here?", 7),
        ("c-002", "assistant", "This is the PDS command workspace. You're on the portfolio overview.", 18),
    ]
    messages = []
    for i, (cid, role, content, toks) in enumerate(msg_rows):
        messages.append({
            "message_id": f"m-{i:03d}",
            "conversation_id": cid,
            "role": role,
            "content": content,
            "tool_calls": None,
            "citations": None,
            "token_count": toks,
            "created_at": now - pd.Timedelta(minutes=60 - i * 3),
        })
    log_rows = []
    for i, m in enumerate(messages):
        if m["role"] != "user":
            continue
        log_rows.append({
            "id": f"log-{i:03d}",
            "conversation_id": m["conversation_id"],
            "session_id": f"sess-{m['conversation_id']}",
            "business_id": "b-meridian" if m["conversation_id"] == "c-001" else "b-stone",
            "env_id": "env-meridian" if m["conversation_id"] == "c-001" else "env-stone",
            "actor": "paul",
            "message_preview": m["content"][:500],
            "route_lane": "B" if m["conversation_id"] == "c-001" else "A",
            "route_model": "gpt-5-mini",
            "is_write": False,
            "prompt_tokens": 1200 + i * 80,
            "completion_tokens": 90 + i * 5,
            "cached_tokens": 200,
            "tool_call_count": 0,
            "rag_chunks_raw": 12,
            "rag_chunks_used": 4,
            "elapsed_ms": 2400 + i * 100,
            "ttft_ms": 800,
            "fallback_used": False,
            "error_message": None,
            "timings_json": json.dumps({
                "embedding_ms": 45, "vector_search_ms": 60,
                "rerank_ms": 120, "prompt_assembly_ms": 15, "model_ms": 2100,
            }),
            "prompt_audit_json": json.dumps({
                "system": 180, "context": 220, "rag": 480,
                "history": 140, "user": 30,
            }),
            "matched_pattern": "fund_detail" if m["conversation_id"] == "c-001" else None,
            "created_at": m["created_at"],
        })
    return LoadedData(
        conversations=pd.DataFrame(conv_rows),
        messages=pd.DataFrame(messages),
        gateway_logs=pd.DataFrame(log_rows),
        prompt_receipts=_empty_frame([
            "receipt_id", "conversation_id", "created_at", "system_prompt",
            "context_block", "rag_block", "history_json",
            "current_user_message", "total_prompt_tokens",
        ]),
        source="synthetic",
        notes=["no CSVs or DB found — using synthetic demo data"],
    )


def load_data(data_dir: Path | str = DEFAULT_DATA_DIR,
              prefer_db: bool = False) -> LoadedData:
    """Try CSV first (or DB first if prefer_db), then fall back to synthetic."""
    if prefer_db:
        live = try_load_from_db()
        if live is not None and not live.conversations.empty:
            return live
    csv_loaded = load_from_csv(data_dir)
    if not csv_loaded.conversations.empty:
        return csv_loaded
    if not prefer_db:
        live = try_load_from_db()
        if live is not None and not live.conversations.empty:
            return live
    return make_synthetic()


# ---------------------------------------------------------------------------
# Profiling
# ---------------------------------------------------------------------------

def profile(data: LoadedData) -> Dict[str, Any]:
    """Return a compact health summary for section 2."""
    logs = data.gateway_logs
    msgs = data.messages

    link_rate: Optional[float] = None
    if not logs.empty and "conversation_id" in logs.columns:
        has_conv = logs["conversation_id"].notna() & (logs["conversation_id"] != "")
        link_rate = float(has_conv.mean()) if len(logs) else None

    per_conv: Optional[pd.Series] = None
    if not msgs.empty and "conversation_id" in msgs.columns:
        per_conv = msgs.groupby("conversation_id").size().sort_values(ascending=False)

    summary = {
        "source": data.source,
        "notes": data.notes,
        "counts": {
            "conversations": len(data.conversations),
            "messages": len(data.messages),
            "gateway_logs": len(data.gateway_logs),
            "prompt_receipts": len(data.prompt_receipts),
        },
        "logs_linked_to_conversation_pct": (
            round(link_rate * 100, 1) if link_rate is not None else None
        ),
        "avg_messages_per_conversation": (
            round(per_conv.mean(), 1) if per_conv is not None and len(per_conv) else None
        ),
        "longest_conversations": (
            per_conv.head(5).to_dict() if per_conv is not None else {}
        ),
    }
    if not logs.empty and "prompt_tokens" in logs.columns:
        pt = pd.to_numeric(logs["prompt_tokens"], errors="coerce").dropna()
        if len(pt):
            summary["prompt_token_p50"] = int(pt.median())
            summary["prompt_token_p95"] = int(pt.quantile(0.95))
            summary["prompt_token_max"] = int(pt.max())
    return summary


# ---------------------------------------------------------------------------
# Conversation explorer
# ---------------------------------------------------------------------------

def list_conversations(data: LoadedData, limit: int = 25) -> pd.DataFrame:
    df = data.conversations.copy()
    if df.empty:
        return df
    if "updated_at" in df.columns:
        df = df.sort_values("updated_at", ascending=False)
    cols = [
        c for c in [
            "conversation_id", "title", "thread_kind", "scope_type",
            "scope_label", "last_route", "updated_at",
        ] if c in df.columns
    ]
    return df[cols].head(limit).reset_index(drop=True)


def conversation_bundle(data: LoadedData, conversation_id: str) -> Dict[str, Any]:
    conv = data.conversations
    msgs = data.messages
    logs = data.gateway_logs
    receipts = data.prompt_receipts

    conv_row = None
    if not conv.empty and "conversation_id" in conv.columns:
        match = conv[conv["conversation_id"] == conversation_id]
        if len(match):
            conv_row = match.iloc[0].to_dict()

    msg_slice = pd.DataFrame()
    if not msgs.empty and "conversation_id" in msgs.columns:
        msg_slice = msgs[msgs["conversation_id"] == conversation_id].copy()
        if "created_at" in msg_slice.columns:
            msg_slice = msg_slice.sort_values("created_at")

    log_slice = pd.DataFrame()
    if not logs.empty and "conversation_id" in logs.columns:
        log_slice = logs[logs["conversation_id"] == conversation_id].copy()
        if "created_at" in log_slice.columns:
            log_slice = log_slice.sort_values("created_at")

    receipt_slice = pd.DataFrame()
    if not receipts.empty and "conversation_id" in receipts.columns:
        receipt_slice = receipts[receipts["conversation_id"] == conversation_id].copy()

    return {
        "conversation": conv_row,
        "messages": msg_slice.reset_index(drop=True),
        "logs": log_slice.reset_index(drop=True),
        "receipts": receipt_slice.reset_index(drop=True),
    }


def render_transcript(bundle: Dict[str, Any], preview_chars: int = 400) -> str:
    msgs: pd.DataFrame = bundle.get("messages", pd.DataFrame())
    if msgs.empty:
        return "(no messages for this conversation)"
    lines = []
    for _, row in msgs.iterrows():
        role = str(row.get("role", "?"))
        content = truncate_preview(row.get("content"), preview_chars)
        created = row.get("created_at", "")
        lines.append(f"[{created}] {role.upper()}")
        for ln in content.splitlines() or [""]:
            lines.append(f"    {ln}")
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Prompt inspection — from real receipts / log audit
# ---------------------------------------------------------------------------

def extract_prompt_audit(log_row: pd.Series) -> Dict[str, Any]:
    """Pull prompt_audit_json and timings_json out of a gateway_logs row."""
    audit = safe_json(log_row.get("prompt_audit_json"))
    timings = safe_json(log_row.get("timings_json"))
    return {
        "prompt_audit": audit if isinstance(audit, dict) else {},
        "timings": timings if isinstance(timings, dict) else {},
        "prompt_tokens": log_row.get("prompt_tokens"),
        "completion_tokens": log_row.get("completion_tokens"),
        "route_lane": log_row.get("route_lane"),
        "route_model": log_row.get("route_model"),
        "rag_chunks_used": log_row.get("rag_chunks_used"),
        "fallback_used": log_row.get("fallback_used"),
        "matched_pattern": log_row.get("matched_pattern"),
    }


def render_prompt_audit(audit: Dict[str, Any]) -> str:
    sections = audit.get("prompt_audit") or {}
    timings = audit.get("timings") or {}
    total = sum(v for v in sections.values() if isinstance(v, (int, float)))
    lines = [f"route_lane={audit.get('route_lane')}  model={audit.get('route_model')}  prompt_tokens={audit.get('prompt_tokens')}"]
    if audit.get("matched_pattern"):
        lines.append(f"matched_pattern={audit.get('matched_pattern')}")
    lines.append(f"rag_chunks_used={audit.get('rag_chunks_used')}  fallback_used={audit.get('fallback_used')}")
    lines.append("")
    lines.append("Section tokens:")
    if not sections:
        lines.append("  (no prompt_audit_json — this turn was logged before instrumentation)")
    else:
        for key, val in sections.items():
            pct = (val / total * 100) if total else 0
            bar = "█" * int(round(pct / 3))
            lines.append(f"  {key:>10} {val:>6}  {pct:5.1f}%  {bar}")
    if timings:
        lines.append("")
        lines.append("Timings:")
        for k, v in timings.items():
            lines.append(f"  {k:>22} {v}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Prompt assembly simulator — the heart of Section 5 and the experiments
# ---------------------------------------------------------------------------

@dataclass
class ContextInputs:
    page_name: str = ""
    module_name: str = ""
    environment_name: str = ""
    business_name: str = ""
    assistant_scope_type: str = ""
    assistant_scope_id: str = ""
    assistant_scope_label: str = ""
    visible_context_summary: str = ""
    thread_entity_state: Dict[str, Any] = field(default_factory=dict)
    current_user_message: str = ""
    prior_history_messages: List[Dict[str, str]] = field(default_factory=list)
    rag_snippets: List[str] = field(default_factory=list)
    lane: str = "B"
    model: str = "gpt-5-mini"
    assistant_role: str = "analyst"
    include_rag: bool = True
    include_visible_context: bool = True
    include_thread_summary: bool = True
    history_depth: Optional[int] = None  # None = use all
    simulated_max_prompt_tokens: int = 16000


ROLE_FRAMINGS = {
    "analyst": (
        "You are Winston, an institutional analyst copilot. Be precise, "
        "cite sources, prefer structured answers, and never invent numbers."
    ),
    "lp_reporting": (
        "You are Winston, an LP reporting assistant. Write in clear, "
        "conservative LP-facing language. Distinguish reported vs estimated "
        "figures."
    ),
    "acquisitions": (
        "You are Winston, an acquisitions assistant. Focus on deal math, "
        "underwriting assumptions, and risk flags. Be brief."
    ),
    "operating_partner": (
        "You are Winston, an operating partner copilot. Focus on asset "
        "performance, leasing, and operational KPIs."
    ),
    "pds_executive": (
        "You are Winston, a PDS executive assistant. Focus on portfolio-wide "
        "status, client health, and delivery risk."
    ),
}


def build_system_prompt(inputs: ContextInputs) -> str:
    base = ROLE_FRAMINGS.get(
        inputs.assistant_role, ROLE_FRAMINGS["analyst"]
    )
    rules = [
        "Ground every factual claim in the provided context or retrieved snippets.",
        "If context is missing, ask a clarifying question instead of guessing.",
        "Use the scope label (not just the id) when referring to entities.",
    ]
    return base + "\n\nRules:\n- " + "\n- ".join(rules)


def build_context_block(inputs: ContextInputs) -> str:
    parts: List[str] = []
    if inputs.business_name:
        parts.append(f"Business: {inputs.business_name}")
    if inputs.environment_name:
        parts.append(f"Environment: {inputs.environment_name}")
    if inputs.module_name:
        parts.append(f"Module: {inputs.module_name}")
    if inputs.page_name:
        parts.append(f"Page: {inputs.page_name}")
    if inputs.assistant_scope_type or inputs.assistant_scope_label:
        label = inputs.assistant_scope_label or "(no label)"
        stype = inputs.assistant_scope_type or "entity"
        sid = inputs.assistant_scope_id or "(no id)"
        parts.append(f"Active scope: {stype} = {label} [id={sid}]")
    if inputs.include_thread_summary and inputs.thread_entity_state:
        try:
            tes = json.dumps(inputs.thread_entity_state, indent=2, default=str)
        except Exception:
            tes = str(inputs.thread_entity_state)
        parts.append("Thread entity state:\n" + tes)
    if not parts:
        return "(no page context attached)"
    return "\n".join(parts)


def build_visible_context_block(inputs: ContextInputs) -> str:
    if not inputs.include_visible_context:
        return ""
    if not inputs.visible_context_summary:
        return "(no visible context summary)"
    return inputs.visible_context_summary.strip()


def build_rag_block(inputs: ContextInputs) -> str:
    if not inputs.include_rag or not inputs.rag_snippets:
        return ""
    bullets = []
    for i, snip in enumerate(inputs.rag_snippets, 1):
        bullets.append(f"[{i}] {snip.strip()}")
    return "\n".join(bullets)


def build_history_block(inputs: ContextInputs) -> List[Dict[str, str]]:
    history = list(inputs.prior_history_messages or [])
    if inputs.history_depth is not None and inputs.history_depth >= 0:
        history = history[-inputs.history_depth:]
    return history


@dataclass
class AssembledPrompt:
    system: str
    context: str
    visible_context: str
    rag: str
    history: List[Dict[str, str]]
    user: str
    section_tokens: Dict[str, int]
    total_tokens: int
    over_budget: bool
    trimmed: List[str]
    budget: int

    def as_markdown(self) -> str:
        lines = [
            "### Assembled prompt",
            f"**Budget:** {self.budget:,} tokens  **Total:** {self.total_tokens:,} tokens  **Over budget:** {self.over_budget}",
            "",
            "**Section tokens:**",
        ]
        for k, v in self.section_tokens.items():
            pct = (v / max(self.total_tokens, 1)) * 100
            lines.append(f"- `{k}`: {v:,} ({pct:.1f}%)")
        if self.trimmed:
            lines.append("")
            lines.append("**Trimmed to fit budget:** " + ", ".join(self.trimmed))
        return "\n".join(lines)


def assemble_prompt(inputs: ContextInputs) -> AssembledPrompt:
    system = build_system_prompt(inputs)
    context = build_context_block(inputs)
    visible = build_visible_context_block(inputs)
    rag = build_rag_block(inputs)
    history = build_history_block(inputs)
    user = inputs.current_user_message or ""

    history_text = "\n".join(
        f"{m.get('role', '?')}: {m.get('content', '')}" for m in history
    )
    tokens = {
        "system": estimate_tokens(system),
        "context": estimate_tokens(context),
        "visible_context": estimate_tokens(visible),
        "rag": estimate_tokens(rag),
        "history": estimate_tokens(history_text),
        "user": estimate_tokens(user),
    }
    total = sum(tokens.values())
    budget = inputs.simulated_max_prompt_tokens
    trimmed: List[str] = []

    # If over budget, trim in the same order the gateway tends to: RAG first,
    # then oldest history, then visible context, then thread summary.
    if total > budget:
        # drop rag entirely
        if rag:
            rag = ""
            tokens["rag"] = 0
            trimmed.append("rag")
            total = sum(tokens.values())
    if total > budget and history:
        # pop oldest until we fit
        while total > budget and history:
            history.pop(0)
            history_text = "\n".join(
                f"{m.get('role', '?')}: {m.get('content', '')}" for m in history
            )
            tokens["history"] = estimate_tokens(history_text)
            total = sum(tokens.values())
        trimmed.append("history_oldest")
    if total > budget and visible:
        visible = ""
        tokens["visible_context"] = 0
        trimmed.append("visible_context")
        total = sum(tokens.values())
    if total > budget and "Thread entity state" in context:
        context = context.split("\nThread entity state:")[0]
        tokens["context"] = estimate_tokens(context)
        trimmed.append("thread_entity_state")
        total = sum(tokens.values())

    return AssembledPrompt(
        system=system,
        context=context,
        visible_context=visible,
        rag=rag,
        history=history,
        user=user,
        section_tokens=tokens,
        total_tokens=total,
        over_budget=total > budget,
        trimmed=trimmed,
        budget=budget,
    )


def render_assembled(ap: AssembledPrompt, width: int = 92) -> str:
    parts = [
        ap.as_markdown(),
        "",
        boxed("SYSTEM", ap.system, width=width),
        boxed("CONTEXT", ap.context, width=width),
    ]
    if ap.visible_context:
        parts.append(boxed("VISIBLE CONTEXT", ap.visible_context, width=width))
    if ap.rag:
        parts.append(boxed("RAG SNIPPETS", ap.rag, width=width))
    if ap.history:
        hist_text = "\n".join(
            f"{m.get('role', '?'):>9}: {m.get('content', '')}" for m in ap.history
        )
        parts.append(boxed(f"HISTORY ({len(ap.history)} msgs)", hist_text, width=width))
    parts.append(boxed("USER", ap.user, width=width))
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Memory failure classification
# ---------------------------------------------------------------------------

FAILURE_LABELS = [
    "thread_linkage_failure",
    "missing_scope_injection",
    "history_window_too_shallow",
    "rag_crowded_out_history",
    "context_block_too_large",
    "token_budget_pressure",
    "missing_thread_summary",
    "unknown",
]


def classify_turn(log_row: pd.Series,
                  conv_row: Optional[pd.Series] = None,
                  msg_count: int = 0,
                  budget: int = 16000) -> Dict[str, Any]:
    """Heuristic root-cause label for a single gateway_logs turn."""
    reasons: List[str] = []
    labels: List[str] = []

    conv_id = log_row.get("conversation_id")
    if conv_id is None or conv_id == "":
        labels.append("thread_linkage_failure")
        reasons.append("gateway log has no conversation_id")

    prompt_tokens = pd.to_numeric(log_row.get("prompt_tokens"), errors="coerce")
    if pd.notna(prompt_tokens) and prompt_tokens > 0.9 * budget:
        labels.append("token_budget_pressure")
        reasons.append(f"prompt_tokens={int(prompt_tokens)} within 10% of budget {budget}")

    audit = safe_json(log_row.get("prompt_audit_json")) or {}
    if isinstance(audit, dict) and audit:
        rag = audit.get("rag", 0) or 0
        hist = audit.get("history", 0) or 0
        ctx = audit.get("context", 0) or 0
        total = sum(v for v in audit.values() if isinstance(v, (int, float))) or 1
        if rag and hist and rag > 3 * hist:
            labels.append("rag_crowded_out_history")
            reasons.append(f"rag tokens ({rag}) > 3x history tokens ({hist})")
        if ctx / total > 0.45:
            labels.append("context_block_too_large")
            reasons.append(f"context section is {ctx/total*100:.0f}% of prompt")

    if conv_row is not None:
        scope_type = conv_row.get("scope_type") if hasattr(conv_row, "get") else None
        scope_label = conv_row.get("scope_label") if hasattr(conv_row, "get") else None
        context_summary = conv_row.get("context_summary") if hasattr(conv_row, "get") else None
        if not scope_type and not scope_label:
            labels.append("missing_scope_injection")
            reasons.append("conversation has no scope_type/scope_label")
        if not context_summary:
            labels.append("missing_thread_summary")
            reasons.append("conversation has no context_summary")

    if msg_count and msg_count >= 8 and "history" in audit:
        hist = audit.get("history", 0) or 0
        if hist < 200:
            labels.append("history_window_too_shallow")
            reasons.append(f"{msg_count} msgs in thread but only {hist} history tokens in prompt")

    if not labels:
        labels.append("unknown")
        reasons.append("no heuristic matched — inspect manually")

    return {
        "conversation_id": conv_id,
        "log_id": log_row.get("id"),
        "user_message": truncate_preview(log_row.get("message_preview"), 160),
        "route_lane": log_row.get("route_lane"),
        "prompt_tokens": int(prompt_tokens) if pd.notna(prompt_tokens) else None,
        "labels": labels,
        "reasons": reasons,
    }


def classify_all(data: LoadedData, budget: int = 16000) -> pd.DataFrame:
    logs = data.gateway_logs
    if logs.empty:
        return pd.DataFrame()
    conv_idx = (
        data.conversations.set_index("conversation_id")
        if not data.conversations.empty and "conversation_id" in data.conversations.columns
        else None
    )
    msg_counts = (
        data.messages.groupby("conversation_id").size().to_dict()
        if not data.messages.empty and "conversation_id" in data.messages.columns
        else {}
    )
    rows = []
    for _, row in logs.iterrows():
        conv_row = None
        cid = row.get("conversation_id")
        if conv_idx is not None and cid in conv_idx.index:
            conv_row = conv_idx.loc[cid]
        rows.append(classify_turn(
            row, conv_row=conv_row, msg_count=msg_counts.get(cid, 0), budget=budget,
        ))
    df = pd.DataFrame(rows)
    if not df.empty:
        df["primary_label"] = df["labels"].apply(lambda xs: xs[0] if xs else "unknown")
    return df


# ---------------------------------------------------------------------------
# Sensitivity experiments
# ---------------------------------------------------------------------------

def _deictic_count(text: str) -> int:
    if not text:
        return 0
    lower = text.lower()
    return sum(lower.count(p) for p in DEICTIC_PHRASES)


def experiment_page_name(base: ContextInputs,
                         page_names: Sequence[str]) -> pd.DataFrame:
    """Hold everything else constant, vary page_name."""
    rows = []
    for name in page_names:
        inputs = ContextInputs(**asdict(base))
        inputs.page_name = name
        ap = assemble_prompt(inputs)
        rows.append({
            "page_name": name,
            "context_tokens": ap.section_tokens["context"],
            "total_tokens": ap.total_tokens,
            "trimmed": ",".join(ap.trimmed),
            "context_preview": truncate_preview(ap.context, 180),
            "deictic_risk": _deictic_count(inputs.current_user_message),
        })
    return pd.DataFrame(rows)


def experiment_entity_label(base: ContextInputs,
                            labels: Sequence[str]) -> pd.DataFrame:
    rows = []
    for lab in labels:
        inputs = ContextInputs(**asdict(base))
        inputs.assistant_scope_label = lab
        ap = assemble_prompt(inputs)
        clarity = (
            "high" if lab and len(lab) > 6 else
            "low" if lab else "none"
        )
        rows.append({
            "scope_label": lab or "(blank)",
            "context_tokens": ap.section_tokens["context"],
            "total_tokens": ap.total_tokens,
            "clarity": clarity,
            "context_preview": truncate_preview(ap.context, 180),
        })
    return pd.DataFrame(rows)


def experiment_history_depth(base: ContextInputs,
                             depths: Sequence[Optional[int]]) -> pd.DataFrame:
    rows = []
    for d in depths:
        inputs = ContextInputs(**asdict(base))
        inputs.history_depth = d
        ap = assemble_prompt(inputs)
        rows.append({
            "history_depth": "all" if d is None else d,
            "history_msgs_kept": len(ap.history),
            "history_tokens": ap.section_tokens["history"],
            "total_tokens": ap.total_tokens,
            "trimmed": ",".join(ap.trimmed),
        })
    return pd.DataFrame(rows)


def experiment_rag_modes(base: ContextInputs,
                         modes: Dict[str, List[str]]) -> pd.DataFrame:
    rows = []
    for label, snippets in modes.items():
        inputs = ContextInputs(**asdict(base))
        inputs.include_rag = bool(snippets)
        inputs.rag_snippets = list(snippets)
        ap = assemble_prompt(inputs)
        rows.append({
            "rag_mode": label,
            "rag_snippets": len(snippets),
            "rag_tokens": ap.section_tokens["rag"],
            "history_tokens": ap.section_tokens["history"],
            "total_tokens": ap.total_tokens,
            "trimmed": ",".join(ap.trimmed),
        })
    return pd.DataFrame(rows)


def experiment_token_cap(base: ContextInputs,
                         caps: Sequence[int]) -> pd.DataFrame:
    rows = []
    for cap in caps:
        inputs = ContextInputs(**asdict(base))
        inputs.simulated_max_prompt_tokens = cap
        ap = assemble_prompt(inputs)
        rows.append({
            "token_cap": cap,
            "total_tokens": ap.total_tokens,
            "over_budget": ap.over_budget,
            "trimmed": ",".join(ap.trimmed) or "(nothing)",
            "rag_tokens": ap.section_tokens["rag"],
            "history_tokens": ap.section_tokens["history"],
            "context_tokens": ap.section_tokens["context"],
        })
    return pd.DataFrame(rows)


def experiment_role_framing(base: ContextInputs,
                            roles: Sequence[str]) -> pd.DataFrame:
    rows = []
    for role in roles:
        inputs = ContextInputs(**asdict(base))
        inputs.assistant_role = role
        ap = assemble_prompt(inputs)
        rows.append({
            "role": role,
            "system_tokens": ap.section_tokens["system"],
            "system_preview": truncate_preview(ap.system, 240),
        })
    return pd.DataFrame(rows)


def experiment_entity_state(base: ContextInputs) -> pd.DataFrame:
    cases = {
        "thread_state_only": (
            {"fund": "Meridian Value Fund I", "quarter": "2025Q4"},
            "",
        ),
        "visible_only": ({}, "User is viewing Fund Detail for Meridian Value Fund I."),
        "both": (
            {"fund": "Meridian Value Fund I", "quarter": "2025Q4"},
            "User is viewing Fund Detail for Meridian Value Fund I.",
        ),
        "neither": ({}, ""),
        "conflict": (
            {"fund": "Stone Growth Fund II", "quarter": "2025Q2"},
            "User is viewing Fund Detail for Meridian Value Fund I.",
        ),
    }
    rows = []
    for label, (tes, vis) in cases.items():
        inputs = ContextInputs(**asdict(base))
        inputs.thread_entity_state = tes
        inputs.visible_context_summary = vis
        ap = assemble_prompt(inputs)
        rows.append({
            "case": label,
            "context_tokens": ap.section_tokens["context"],
            "visible_tokens": ap.section_tokens["visible_context"],
            "has_thread_state": bool(tes),
            "has_visible": bool(vis),
            "context_preview": truncate_preview(ap.context, 220),
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------------

def recommend(classified: pd.DataFrame, data: LoadedData) -> Dict[str, Any]:
    if classified is None or classified.empty:
        return {"note": "no classified turns — nothing to recommend"}
    label_counts = classified["primary_label"].value_counts().to_dict()
    top = sorted(label_counts.items(), key=lambda kv: kv[1], reverse=True)[:3]

    fixes = {
        "thread_linkage_failure": (
            "Ensure the gateway logger always writes conversation_id; check "
            "that the frontend attaches the active conversation to every "
            "request, not just the first turn."
        ),
        "missing_scope_injection": (
            "Populate ai_conversations.scope_type/scope_id/scope_label on "
            "thread creation so page context is durable across turns."
        ),
        "history_window_too_shallow": (
            "Raise the history window for lanes where continuity matters, or "
            "add a rolling thread summary so older turns stay represented."
        ),
        "rag_crowded_out_history": (
            "Lower rerank_top_k, tighten the RAG score threshold, or reserve "
            "a minimum history budget before RAG is added."
        ),
        "context_block_too_large": (
            "Compress the page context block — drop verbose fields or replace "
            "JSON dumps with short labeled summaries."
        ),
        "token_budget_pressure": (
            "Prompt is bumping the cap. Either raise the cap (if the model "
            "supports it) or add a summarizer pass on the history block."
        ),
        "missing_thread_summary": (
            "Write context_summary when threads are created from a page so "
            "the scope intent survives even if the UI context drops."
        ),
        "unknown": (
            "No heuristic matched — inspect manually; consider adding a new "
            "rule to this classifier."
        ),
    }

    worth_inspecting = classified[classified["primary_label"] != "unknown"].head(8)
    token_pressure_pct = (
        classified["labels"].apply(lambda xs: "token_budget_pressure" in xs).mean() * 100
    )
    context_pct = (
        classified["labels"].apply(lambda xs: "context_block_too_large" in xs).mean() * 100
    )

    return {
        "top_labels": top,
        "candidate_fixes": [(lab, fixes[lab]) for lab, _ in top],
        "conversations_worth_inspecting": (
            worth_inspecting[["conversation_id", "log_id", "primary_label", "user_message"]]
            .to_dict(orient="records")
            if not worth_inspecting.empty else []
        ),
        "token_pressure_share_pct": round(float(token_pressure_pct), 1),
        "context_instability_share_pct": round(float(context_pct), 1),
        "primary_driver": (
            "token_pressure" if token_pressure_pct >= context_pct
            else "context_instability"
        ),
        "source_note": f"loaded from: {data.source}",
    }


# ---------------------------------------------------------------------------
# Convenience builders for Section 5's lab
# ---------------------------------------------------------------------------

def default_lab_inputs() -> ContextInputs:
    return ContextInputs(
        page_name="Fund Detail",
        module_name="REPE",
        environment_name="Meridian Capital",
        business_name="Meridian Capital Partners",
        assistant_scope_type="fund",
        assistant_scope_id="fund-mvf1",
        assistant_scope_label="Meridian Value Fund I",
        visible_context_summary=(
            "User is on the Fund Detail page for Meridian Value Fund I. "
            "Visible widgets: TVPI 1.42x, Net IRR 11.8%, "
            "3 assets, 2025Q4 snapshot."
        ),
        thread_entity_state={
            "fund_id": "fund-mvf1",
            "fund_name": "Meridian Value Fund I",
            "quarter": "2025Q4",
            "assets_in_view": 3,
        },
        current_user_message="What is going on here?",
        prior_history_messages=[
            {"role": "user", "content": "What is the current TVPI for this fund?"},
            {"role": "assistant", "content": "TVPI is 1.42x as of 2025-Q4."},
            {"role": "user", "content": "And the IRR?"},
            {"role": "assistant", "content": "Net IRR 11.8%, gross IRR 14.2%."},
        ],
        rag_snippets=[
            "Meridian Value Fund I 2025Q4 quarter-close: TVPI 1.42, DPI 0.35, RVPI 1.07.",
            "Glossary: TVPI = (cumulative distributions + NAV) / contributed capital.",
        ],
        lane="B",
        model="gpt-5-mini",
        assistant_role="analyst",
        simulated_max_prompt_tokens=16000,
    )
