from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
import re
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


PRIME_RELEVANCE_THRESHOLD = Decimal('70')
PRIME_WEAKNESS_THRESHOLD = Decimal('60')
OPPORTUNITY_KINDS = {
    'winston_backlog',
    'consulting_offer',
    'outreach_angle',
    'demo_brief',
}
OUTREACH_REQUIRED_FIELDS = [
    'target_persona',
    'trigger_signal',
    'pain_statement',
    'positioning_angle',
    'hook',
    'proof_reference',
    'next_action',
]
DEMO_REQUIRED_FIELDS = [
    'target_persona',
    'pain_statement',
    'ui_flow',
    'narrative',
    'winston_modules_touched',
    'proof_reference',
    'next_action',
]
CONSULTING_REQUIRED_FIELDS = [
    'target_persona',
    'pain_statement',
    'scope',
    'out_of_scope',
    'pricing_angle',
    'proof_reference',
    'next_action',
]
BACKLOG_REQUIRED_FIELDS = [
    'pain_statement',
    'proposed_module',
    'revenue_linkage',
    'effort_estimate',
    'proof_reference',
    'next_action',
]
REQUIRED_FIELDS_BY_KIND = {
    'outreach_angle': OUTREACH_REQUIRED_FIELDS,
    'demo_brief': DEMO_REQUIRED_FIELDS,
    'consulting_offer': CONSULTING_REQUIRED_FIELDS,
    'winston_backlog': BACKLOG_REQUIRED_FIELDS,
}
MUST_EDIT_FIELDS_BY_KIND = {
    'outreach_angle': ['hook', 'proof_reference'],
    'demo_brief': ['narrative', 'proof_reference'],
    'consulting_offer': ['pricing_angle', 'proof_reference'],
    'winston_backlog': ['revenue_linkage', 'proof_reference'],
}
STOP_WORDS = {
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'if', 'in',
    'into', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'their', 'this', 'to',
    'with', 'your', 'you', 'firms', 'teams', 'team', 'workflow', 'workflows',
}


class AppIntelMemoMaterialError(Exception):
    def __init__(self, missing: str, detail: str):
        super().__init__(detail)
        self.missing = missing
        self.detail = detail


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clean_text(value: str | None) -> str:
    return (value or '').strip()


def _clean_signal_list(values: list[str] | tuple[str, ...] | None) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        item = _clean_text(value)
        if not item:
            continue
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(item)
    return cleaned


def _workflow_shape(record: dict) -> str:
    return ' -> '.join(
        part for part in [
            _clean_text(record.get('core_workflow_input')),
            _clean_text(record.get('core_workflow_process')),
            _clean_text(record.get('core_workflow_output')),
        ]
        if part
    )


def _normalize_tokens(text: str | None) -> set[str]:
    return {
        token
        for token in re.findall(r'[a-z0-9]+', (text or '').lower())
        if token and token not in STOP_WORDS and len(token) > 2
    }


def _trigram_set(text: str | None) -> set[str]:
    normalized = re.sub(r'\s+', ' ', (text or '').strip().lower())
    if not normalized:
        return set()
    padded = f'  {normalized} '
    return {padded[i:i + 3] for i in range(len(padded) - 2)}


def _trigram_similarity(left: str | None, right: str | None) -> float:
    left_set = _trigram_set(left)
    right_set = _trigram_set(right)
    if not left_set or not right_set:
        return 0.0
    union = left_set | right_set
    if not union:
        return 0.0
    return len(left_set & right_set) / len(union)


def _keyword_overlap_score(left: str | None, right: str | None) -> float:
    left_tokens = _normalize_tokens(left)
    right_tokens = _normalize_tokens(right)
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / max(len(left_tokens), 1)


def _pain_overlap_score(pattern: dict, record: dict) -> float:
    recurring = _normalize_tokens(pattern.get('recurring_pain'))
    record_tokens = _normalize_tokens(' '.join(record.get('pain_signals') or []))
    if not recurring or not record_tokens:
        return 0.0
    return len(recurring & record_tokens) / max(len(recurring), 1)


def _decimal(value: object | None, fallback: Decimal = Decimal('0')) -> Decimal:
    if value is None:
        return fallback
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _is_prime(record: dict) -> bool:
    return (
        _decimal(record.get('relevance_score')) >= PRIME_RELEVANCE_THRESHOLD
        and _decimal(record.get('weakness_score')) >= PRIME_WEAKNESS_THRESHOLD
    )


def _record_payload(row: dict) -> dict:
    payload = dict(row)
    payload['pain_signals'] = _clean_signal_list(row.get('pain_signals'))
    payload['workflow_shape'] = _workflow_shape(row)
    payload['top_pain_signal'] = payload['pain_signals'][0] if payload['pain_signals'] else None
    payload['linked_pattern_count'] = int(row.get('linked_pattern_count') or 0)
    payload['linked_opportunity_count'] = int(row.get('linked_opportunity_count') or 0)
    payload['is_prime'] = _is_prime(row)
    return payload


def _pattern_payload(row: dict, evidence: list[dict] | None = None) -> dict:
    payload = dict(row)
    payload['industries_seen_in'] = list(row.get('industries_seen_in') or [])
    payload['evidence_count'] = int(row.get('evidence_count') or 0)
    payload['linked_opportunity_count'] = int(row.get('linked_opportunity_count') or 0)
    payload['evidence'] = evidence or []
    return payload


def _opportunity_payload(row: dict) -> dict:
    payload = dict(row)
    payload['payload'] = dict(row.get('payload') or {})
    return payload


def _memo_payload(row: dict) -> dict:
    payload = dict(row)
    payload['memo_payload'] = dict(row.get('memo_payload') or {})
    return payload


def _app_opportunity_table_exists(cur) -> bool:
    try:
        cur.execute("SELECT to_regclass('public.cro_app_opportunity') AS table_name")
        row = cur.fetchone()
        return bool(row and row.get('table_name'))
    except Exception:
        return False


def _app_weekly_memo_table_exists(cur) -> bool:
    try:
        cur.execute("SELECT to_regclass('public.cro_app_weekly_memo') AS table_name")
        row = cur.fetchone()
        return bool(row and row.get('table_name'))
    except Exception:
        return False


def _supports_pg_trgm(cur) -> bool:
    try:
        cur.execute("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS available")
        row = cur.fetchone()
        return bool(row and row.get('available'))
    except Exception:
        return False


def create_inbox_item(*, env_id: str, business_id: UUID, payload: dict) -> dict:
    screenshot_urls = _clean_signal_list(payload.get('screenshot_urls'))
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_app_inbox_item (
                env_id, business_id, source, platform, app_name, category,
                search_term, url, raw_notes, screenshot_urls, created_by
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                env_id,
                str(business_id),
                payload.get('source'),
                payload.get('platform'),
                payload['app_name'],
                payload.get('category'),
                payload.get('search_term'),
                payload.get('url'),
                payload.get('raw_notes'),
                screenshot_urls,
                payload.get('created_by'),
            ),
        )
        row = cur.fetchone()
    return dict(row)


def list_inbox(*, env_id: str, business_id: UUID, status: str | None = None) -> list[dict]:
    params: list[object] = [env_id, str(business_id)]
    sql = """
        SELECT *
        FROM cro_app_inbox_item
        WHERE env_id = %s AND business_id = %s
    """
    if status:
        sql += ' AND status = %s'
        params.append(status)
    sql += ' ORDER BY created_at DESC'
    with get_cursor() as cur:
        cur.execute(sql, tuple(params))
        return [dict(row) for row in cur.fetchall()]


def discard_inbox_item(*, env_id: str, business_id: UUID, inbox_item_id: UUID, reason: str) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_app_inbox_item
            SET status = 'discarded',
                discarded_reason = %s,
                discarded_at = now(),
                processed_at = NULL
            WHERE id = %s AND env_id = %s AND business_id = %s
            RETURNING *
            """,
            (reason, str(inbox_item_id), env_id, str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f'Inbox item {inbox_item_id} not found')
    return dict(row)


def extract_app_record(*, env_id: str, business_id: UUID, inbox_item_id: UUID, payload: dict) -> dict:
    pain_signals = _clean_signal_list(payload.get('pain_signals'))
    if not pain_signals:
        raise ValueError('pain_signals must include at least one item')
    for field in ('core_workflow_input', 'core_workflow_process', 'core_workflow_output'):
        if not _clean_text(payload.get(field)):
            raise ValueError(f'{field} is required')

    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM cro_app_inbox_item WHERE id = %s AND env_id = %s AND business_id = %s",
            (str(inbox_item_id), env_id, str(business_id)),
        )
        inbox_item = cur.fetchone()
        if not inbox_item:
            raise LookupError(f'Inbox item {inbox_item_id} not found')
        if inbox_item.get('status') == 'discarded':
            raise ValueError('Discarded inbox items cannot be extracted')

        cur.execute(
            """
            INSERT INTO cro_app_record (
                env_id, business_id, inbox_item_id, app_name, target_user,
                core_workflow_input, core_workflow_process, core_workflow_output,
                pain_signals, relevance_score, weakness_score, notes
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *, 0::int AS linked_pattern_count, 0::int AS linked_opportunity_count
            """,
            (
                env_id,
                str(business_id),
                str(inbox_item_id),
                inbox_item['app_name'],
                payload.get('target_user'),
                payload['core_workflow_input'],
                payload['core_workflow_process'],
                payload['core_workflow_output'],
                pain_signals,
                payload.get('relevance_score') if payload.get('relevance_score') is not None else Decimal('50'),
                payload.get('weakness_score') if payload.get('weakness_score') is not None else Decimal('50'),
                payload.get('notes'),
            ),
        )
        record = cur.fetchone()
        cur.execute(
            """
            UPDATE cro_app_inbox_item
            SET status = 'extracted',
                discarded_reason = NULL,
                discarded_at = NULL,
                processed_at = now()
            WHERE id = %s
            """,
            (str(inbox_item_id),),
        )
    return _record_payload(record)


def list_records(*, env_id: str, business_id: UUID, prime_only: bool = False, unconverted: bool = False) -> list[dict]:
    with get_cursor() as cur:
        has_opportunities = _app_opportunity_table_exists(cur)
        sql = """
            SELECT
                r.*,
                COALESCE(pe.pattern_count, 0) AS linked_pattern_count,
                COALESCE(op.opportunity_count, 0) AS linked_opportunity_count
            FROM cro_app_record r
            LEFT JOIN (
                SELECT app_record_id, COUNT(*)::int AS pattern_count
                FROM cro_app_pattern_evidence
                GROUP BY app_record_id
            ) pe ON pe.app_record_id = r.id
        """
        if has_opportunities:
            sql += """
            LEFT JOIN (
                SELECT app_record_id, COUNT(*)::int AS opportunity_count
                FROM cro_app_opportunity
                GROUP BY app_record_id
            ) op ON op.app_record_id = r.id
            """
        else:
            sql += "LEFT JOIN (SELECT NULL::uuid AS app_record_id, 0::int AS opportunity_count) op ON false "
        sql += "WHERE r.env_id = %s AND r.business_id = %s"
        params: list[object] = [env_id, str(business_id)]
        if prime_only:
            sql += ' AND r.relevance_score >= %s AND r.weakness_score >= %s'
            params.extend([PRIME_RELEVANCE_THRESHOLD, PRIME_WEAKNESS_THRESHOLD])
        if unconverted:
            if has_opportunities:
                sql += ' AND COALESCE(op.opportunity_count, 0) = 0'
            else:
                sql += ' AND COALESCE(pe.pattern_count, 0) = 0'
        sql += ' ORDER BY r.updated_at DESC, r.created_at DESC'
        cur.execute(sql, tuple(params))
        return [_record_payload(row) for row in cur.fetchall()]


def get_record(*, env_id: str, business_id: UUID, record_id: UUID) -> dict:
    rows = list_records(env_id=env_id, business_id=business_id)
    for row in rows:
        if str(row['id']) == str(record_id):
            return row
    raise LookupError(f'App record {record_id} not found')


def update_record(*, env_id: str, business_id: UUID, record_id: UUID, payload: dict) -> dict:
    updates: list[str] = []
    params: list[object] = []
    allowed_fields = {
        'target_user',
        'core_workflow_input',
        'core_workflow_process',
        'core_workflow_output',
        'relevance_score',
        'weakness_score',
        'notes',
    }
    for field in allowed_fields:
        if field in payload and payload[field] is not None:
            updates.append(f'{field} = %s')
            params.append(payload[field])
    if 'pain_signals' in payload and payload['pain_signals'] is not None:
        cleaned = _clean_signal_list(payload['pain_signals'])
        if not cleaned:
            raise ValueError('pain_signals must include at least one item')
        updates.append('pain_signals = %s')
        params.append(cleaned)
    if not updates:
        return get_record(env_id=env_id, business_id=business_id, record_id=record_id)
    updates.append('updated_at = now()')
    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE cro_app_record
            SET {', '.join(updates)}
            WHERE id = %s AND env_id = %s AND business_id = %s
            RETURNING *
            """,
            tuple(params + [str(record_id), env_id, str(business_id)]),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f'App record {record_id} not found')
    return get_record(env_id=env_id, business_id=business_id, record_id=record_id)


def _list_pattern_evidence(cur, pattern_ids: list[str]) -> dict[str, list[dict]]:
    if not pattern_ids:
        return {}
    cur.execute(
        """
        SELECT
            pe.pattern_id,
            pe.app_record_id,
            pe.contribution_note,
            pe.auto_suggested,
            pe.created_at,
            r.app_name,
            r.core_workflow_input,
            r.core_workflow_process,
            r.core_workflow_output,
            r.pain_signals
        FROM cro_app_pattern_evidence pe
        JOIN cro_app_record r ON r.id = pe.app_record_id
        WHERE pe.pattern_id = ANY(%s)
        ORDER BY pe.created_at DESC
        """,
        (pattern_ids,),
    )
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in cur.fetchall():
        grouped[str(row['pattern_id'])].append(
            {
                'app_record_id': row['app_record_id'],
                'app_name': row['app_name'],
                'workflow_shape': _workflow_shape(row),
                'pain_signals': _clean_signal_list(row.get('pain_signals')),
                'contribution_note': row.get('contribution_note'),
                'auto_suggested': bool(row.get('auto_suggested')),
                'created_at': row.get('created_at'),
            }
        )
    return grouped


def list_patterns(*, env_id: str, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        has_opportunities = _app_opportunity_table_exists(cur)
        sql = """
            SELECT
                p.*,
                COALESCE(ev.evidence_count, 0) AS evidence_count,
                COALESCE(op.opportunity_count, 0) AS linked_opportunity_count
            FROM cro_app_pattern p
            LEFT JOIN (
                SELECT pattern_id, COUNT(*)::int AS evidence_count
                FROM cro_app_pattern_evidence
                GROUP BY pattern_id
            ) ev ON ev.pattern_id = p.id
        """
        if has_opportunities:
            sql += """
            LEFT JOIN (
                SELECT pattern_id, COUNT(*)::int AS opportunity_count
                FROM cro_app_opportunity
                GROUP BY pattern_id
            ) op ON op.pattern_id = p.id
            """
        else:
            sql += "LEFT JOIN (SELECT NULL::uuid AS pattern_id, 0::int AS opportunity_count) op ON false "
        sql += ' WHERE p.env_id = %s AND p.business_id = %s'
        sql += " ORDER BY CASE p.priority WHEN 'high' THEN 0 WHEN 'med' THEN 1 ELSE 2 END, p.confidence DESC, p.updated_at DESC"
        cur.execute(sql, (env_id, str(business_id)))
        rows = cur.fetchall()
        evidence = _list_pattern_evidence(cur, [str(row['id']) for row in rows])
    return [_pattern_payload(row, evidence.get(str(row['id']), [])) for row in rows]


def get_pattern(*, env_id: str, business_id: UUID, pattern_id: UUID) -> dict:
    rows = list_patterns(env_id=env_id, business_id=business_id)
    for row in rows:
        if str(row['id']) == str(pattern_id):
            return row
    raise LookupError(f'Pattern {pattern_id} not found')


def suggest_evidence(*, env_id: str, business_id: UUID, pattern: dict, candidate_records: list[dict] | None = None, pg_trgm_available: bool | None = None) -> list[dict]:
    if candidate_records is None:
        candidate_records = list_records(env_id=env_id, business_id=business_id)
    if pg_trgm_available is None:
        with get_cursor() as cur:
            pg_trgm_available = _supports_pg_trgm(cur)

    suggestions: list[dict] = []
    for record in candidate_records:
        workflow_text = record.get('workflow_shape') or _workflow_shape(record)
        trigram_score = _trigram_similarity(pattern.get('workflow_shape'), workflow_text) if pg_trgm_available else _keyword_overlap_score(pattern.get('workflow_shape'), workflow_text)
        pain_score = _pain_overlap_score(pattern, record)
        score = round((0.6 * trigram_score) + (0.4 * pain_score), 4)
        if score <= 0.3:
            continue
        suggestions.append(
            {
                'app_record_id': record['id'],
                'app_name': record['app_name'],
                'workflow_shape': workflow_text,
                'pain_signals': _clean_signal_list(record.get('pain_signals')),
                'contribution_note': None,
                'auto_suggested': True,
                'created_at': record.get('updated_at') or record.get('created_at'),
                'score': score,
            }
        )
    suggestions.sort(key=lambda item: (-item['score'], item['app_name'].lower()))
    return suggestions[:5]


def create_pattern(*, env_id: str, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_app_pattern (
                env_id, business_id, pattern_name, workflow_shape, industries_seen_in,
                recurring_pain, bad_implementation_pattern, winston_module_opportunity,
                consulting_offer_opportunity, demo_idea, priority, confidence, status, notes
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                env_id,
                str(business_id),
                payload['pattern_name'],
                payload.get('workflow_shape'),
                payload.get('industries_seen_in') or [],
                payload.get('recurring_pain'),
                payload.get('bad_implementation_pattern'),
                payload.get('winston_module_opportunity'),
                payload.get('consulting_offer_opportunity'),
                payload.get('demo_idea'),
                payload.get('priority', 'med'),
                payload.get('confidence', Decimal('0.5')),
                payload.get('status', 'draft'),
                payload.get('notes'),
            ),
        )
        row = cur.fetchone()
        pg_trgm_available = _supports_pg_trgm(cur)
    pattern = get_pattern(env_id=env_id, business_id=business_id, pattern_id=row['id'])
    suggestions = suggest_evidence(
        env_id=env_id,
        business_id=business_id,
        pattern=pattern,
        pg_trgm_available=pg_trgm_available,
    )
    existing_ids = {item['app_record_id'] for item in pattern.get('evidence', [])}
    suggestions = [item for item in suggestions if item['app_record_id'] not in existing_ids]
    return {'pattern': pattern, 'suggested_evidence': suggestions}


def link_pattern_evidence(*, env_id: str, business_id: UUID, pattern_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        if payload.get('unlink'):
            cur.execute(
                'DELETE FROM cro_app_pattern_evidence WHERE pattern_id = %s AND app_record_id = %s',
                (str(pattern_id), str(payload['app_record_id'])),
            )
        else:
            cur.execute(
                """
                INSERT INTO cro_app_pattern_evidence (pattern_id, app_record_id, contribution_note, auto_suggested)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (pattern_id, app_record_id)
                DO UPDATE SET
                    contribution_note = EXCLUDED.contribution_note,
                    auto_suggested = EXCLUDED.auto_suggested
                """,
                (
                    str(pattern_id),
                    str(payload['app_record_id']),
                    payload.get('contribution_note'),
                    bool(payload.get('auto_suggested')),
                ),
            )
    return get_pattern(env_id=env_id, business_id=business_id, pattern_id=pattern_id)


def _infer_outreach_channel(payload: dict) -> str:
    next_action = (payload.get('next_action') or '').lower()
    if 'email' in next_action:
        return 'email'
    if 'phone' in next_action or 'call' in next_action:
        return 'phone'
    if 'linkedin' in next_action:
        return 'linkedin'
    return 'linkedin'


def _pain_statement(record: dict | None, pattern: dict | None) -> str:
    if record and record.get('pain_signals'):
        signal = _clean_signal_list(record.get('pain_signals'))[0]
        return f"{signal} across {_workflow_shape(record)}"
    recurring = _clean_text(pattern.get('recurring_pain') if pattern else None)
    return recurring or '[set pain statement]'


def _target_persona(record: dict | None, pattern: dict | None) -> str:
    industries = list((pattern or {}).get('industries_seen_in') or [])
    return industries[0] if industries else (_clean_text((record or {}).get('target_user')) or '[set persona]')


def _draft_title(kind: str, pattern: dict | None, record: dict | None) -> str:
    base = (pattern or {}).get('pattern_name') or (record or {}).get('app_name') or 'Opportunity'
    suffix = {
        'outreach_angle': 'Outreach Angle',
        'demo_brief': 'Demo Brief',
        'consulting_offer': 'Consulting Offer',
        'winston_backlog': 'Winston Backlog Item',
    }[kind]
    return f'{base} {suffix}'


def _draft_payload(kind: str, pattern: dict | None, record: dict | None) -> tuple[str, dict, list[str]]:
    persona = _target_persona(record, pattern)
    pain = _pain_statement(record, pattern)
    proof_reference = '[link a case study]'
    workflow_shape = _workflow_shape(record or {}) or _clean_text((pattern or {}).get('workflow_shape')) or '[set workflow shape]'
    position = _clean_text((pattern or {}).get('winston_module_opportunity')) or _clean_text((pattern or {}).get('consulting_offer_opportunity')) or '[positioning angle]'
    pattern_industry = list((pattern or {}).get('industries_seen_in') or [])
    industry_label = pattern_industry[0] if pattern_industry else '[industry]'
    trigger = (_clean_signal_list((record or {}).get('pain_signals')) or ['[trigger signal]'])[0]
    title = _draft_title(kind, pattern, record)
    if kind == 'outreach_angle':
        payload = {
            'target_persona': persona,
            'trigger_signal': trigger,
            'pain_statement': pain,
            'positioning_angle': position,
            'hook': f'We rebuilt this for {industry_label} firms' if pattern_industry else '[hook]',
            'proof_reference': proof_reference,
            'next_action': 'Send LinkedIn DM',
        }
    elif kind == 'demo_brief':
        payload = {
            'target_persona': persona,
            'pain_statement': pain,
            'ui_flow': [
                f'Open the workflow intake for {workflow_shape}',
                'Show the bottleneck detection step',
                'Close with the downstream action queue',
            ],
            'narrative': f'Show how Winston compresses {pain.lower()} into a repeatable operator workflow.',
            'winston_modules_touched': [position if position != '[positioning angle]' else '[set Winston module]'],
            'proof_reference': proof_reference,
            'next_action': 'Build mock',
        }
    elif kind == 'consulting_offer':
        payload = {
            'target_persona': persona,
            'pain_statement': pain,
            'scope': f'Audit and rebuild the {workflow_shape} workflow.',
            'out_of_scope': 'Downstream change management and full ERP replacement.',
            'pricing_angle': 'fixed',
            'proof_reference': proof_reference,
            'next_action': 'Draft offer outline',
        }
    else:
        payload = {
            'pain_statement': pain,
            'proposed_module': position if position != '[positioning angle]' else '[set proposed module]',
            'revenue_linkage': 'Unlock repeatable consulting and outreach motion from this pattern.',
            'effort_estimate': 'm',
            'proof_reference': proof_reference,
            'next_action': 'Prioritize in backlog grooming',
        }
    return title, payload, MUST_EDIT_FIELDS_BY_KIND[kind]


def _validate_payload(kind: str, payload: dict) -> None:
    if kind not in OPPORTUNITY_KINDS:
        raise ValueError(f'Unsupported opportunity kind: {kind}')
    missing = [field for field in REQUIRED_FIELDS_BY_KIND[kind] if field not in payload or payload[field] in (None, '', [])]
    if missing:
        raise ValueError(f'Missing required {kind} payload fields: {", ".join(missing)}')
    if kind == 'winston_backlog' and payload.get('effort_estimate') not in {'s', 'm', 'l'}:
        raise ValueError('winston_backlog.effort_estimate must be one of s, m, l')


def _render_brief_markdown(kind: str, title: str, payload: dict) -> str:
    if kind == "outreach_angle":
        return "\n".join([
            f"# {title}",
            "Persona: " + str(payload["target_persona"]),
            "Trigger: " + str(payload["trigger_signal"]),
            "Pain: " + str(payload["pain_statement"]),
            "Angle: " + str(payload["positioning_angle"]),
            "Hook: " + str(payload["hook"]),
            "Proof: " + str(payload["proof_reference"]),
            "Next action: " + str(payload["next_action"]),
        ])
    if kind == "demo_brief":
        flow = "\n".join(f"- {step}" for step in payload["ui_flow"])
        modules = ", ".join(payload["winston_modules_touched"])
        return "\n".join([
            f"# {title}",
            "Persona: " + str(payload["target_persona"]),
            "Pain: " + str(payload["pain_statement"]),
            "Narrative: " + str(payload["narrative"]),
            "Winston modules: " + modules,
            "UI flow:",
            flow,
            "Proof: " + str(payload["proof_reference"]),
            "Next action: " + str(payload["next_action"]),
        ])
    if kind == "consulting_offer":
        return "\n".join([
            f"# {title}",
            "Persona: " + str(payload["target_persona"]),
            "Pain: " + str(payload["pain_statement"]),
            "Scope: " + str(payload["scope"]),
            "Out of scope: " + str(payload["out_of_scope"]),
            "Pricing angle: " + str(payload["pricing_angle"]),
            "Proof: " + str(payload["proof_reference"]),
            "Next action: " + str(payload["next_action"]),
        ])
    return "\n".join([
        f"# {title}",
        "Pain: " + str(payload["pain_statement"]),
        "Proposed module: " + str(payload["proposed_module"]),
        "Revenue linkage: " + str(payload["revenue_linkage"]),
        "Effort estimate: " + str(payload["effort_estimate"]),
        "Proof: " + str(payload["proof_reference"]),
        "Next action: " + str(payload["next_action"]),
    ])

def _load_source_context(cur, env_id: str, business_id: UUID, source_pattern_id: UUID | None, source_app_record_id: UUID | None) -> tuple[dict | None, dict | None]:
    pattern = None
    record = None
    if source_pattern_id:
        patterns = list_patterns(env_id=env_id, business_id=business_id)
        pattern = next((item for item in patterns if str(item['id']) == str(source_pattern_id)), None)
        if not pattern:
            raise LookupError(f'Pattern {source_pattern_id} not found')
    if source_app_record_id:
        records = list_records(env_id=env_id, business_id=business_id)
        record = next((item for item in records if str(item['id']) == str(source_app_record_id)), None)
        if not record:
            raise LookupError(f'App record {source_app_record_id} not found')
    if pattern and record is None and pattern.get('evidence'):
        evidence_record_id = pattern['evidence'][0]['app_record_id']
        records = list_records(env_id=env_id, business_id=business_id)
        record = next((item for item in records if str(item['id']) == str(evidence_record_id)), None)
    return pattern, record


def draft_opportunity_payload(*, env_id: str, business_id: UUID, kind: str, source_pattern_id: UUID | None = None, source_app_record_id: UUID | None = None) -> dict:
    if not source_pattern_id and not source_app_record_id:
        raise ValueError('A source pattern or source app record is required')
    with get_cursor() as cur:
        pattern, record = _load_source_context(cur, env_id, business_id, source_pattern_id, source_app_record_id)
    title, payload, must_edit_fields = _draft_payload(kind, pattern, record)
    return {
        'title': title,
        'payload': payload,
        'must_edit_fields': must_edit_fields,
    }


def _inbox_to_opportunity_hours(cur, opportunity_id: UUID) -> float | None:
    cur.execute(
        """
        SELECT EXTRACT(EPOCH FROM (o.created_at - i.created_at)) / 3600.0 AS hours
        FROM cro_app_opportunity o
        JOIN cro_app_record r ON r.id = o.app_record_id
        JOIN cro_app_inbox_item i ON i.id = r.inbox_item_id
        WHERE o.id = %s
        """,
        (str(opportunity_id),),
    )
    row = cur.fetchone()
    return float(row['hours']) if row and row.get('hours') is not None else None


def _opportunity_to_sent_hours(cur, opportunity_id: UUID) -> float | None:
    cur.execute(
        """
        SELECT EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600.0 AS hours
        FROM cro_app_opportunity
        WHERE id = %s
        """,
        (str(opportunity_id),),
    )
    row = cur.fetchone()
    return float(row['hours']) if row and row.get('hours') is not None else None


def _export_outreach_template(cur, *, env_id: str, business_id: UUID, opportunity_id: UUID, title: str, payload: dict, brief_markdown: str) -> tuple[str, str]:
    channel = _infer_outreach_channel(payload)
    cur.execute(
        """
        INSERT INTO cro_outreach_template (
            env_id, business_id, name, channel, category, subject_template,
            body_template, source_opportunity_id
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            env_id,
            str(business_id),
            title,
            channel,
            'app_intelligence',
            payload.get('hook'),
            brief_markdown,
            str(opportunity_id),
        ),
    )
    row = cur.fetchone()
    return 'cro_outreach_template', str(row['id'])


def _create_opportunity(*, env_id: str, business_id: UUID, kind: str, title: str, payload: dict, status: str, pattern_id: UUID | None = None, app_record_id: UUID | None = None) -> dict:
    _validate_payload(kind, payload)
    brief_markdown = _render_brief_markdown(kind, title, payload)
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_app_opportunity (
                env_id, business_id, pattern_id, app_record_id, kind, title,
                payload, brief_markdown, status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
            RETURNING *
            """,
            (
                env_id,
                str(business_id),
                str(pattern_id) if pattern_id else None,
                str(app_record_id) if app_record_id else None,
                kind,
                title,
                payload,
                brief_markdown,
                status,
            ),
        )
        row = cur.fetchone()
        if kind == 'outreach_angle':
            exported_to, exported_ref = _export_outreach_template(
                cur,
                env_id=env_id,
                business_id=business_id,
                opportunity_id=row['id'],
                title=title,
                payload=payload,
                brief_markdown=brief_markdown,
            )
            cur.execute(
                """
                UPDATE cro_app_opportunity
                SET exported_to = %s,
                    exported_ref = %s,
                    updated_at = now()
                WHERE id = %s
                RETURNING *
                """,
                (exported_to, exported_ref, str(row['id'])),
            )
            row = cur.fetchone()
        hours = _inbox_to_opportunity_hours(cur, row['id']) if app_record_id else None
    emit_log(
        level='info',
        service='backend',
        action='cro.app_intelligence.opportunity_created',
        message=f'App Intelligence {kind} created',
        context={
            'opportunity_id': str(row['id']),
            'kind': kind,
            'inbox_to_opportunity_hours': hours,
        },
    )
    return _opportunity_payload(row)


def create_pattern_opportunity(*, env_id: str, business_id: UUID, pattern_id: UUID, kind: str, title: str, payload: dict, status: str = 'draft') -> dict:
    return _create_opportunity(
        env_id=env_id,
        business_id=business_id,
        pattern_id=pattern_id,
        app_record_id=None,
        kind=kind,
        title=title,
        payload=payload,
        status=status,
    )


def create_record_opportunity(*, env_id: str, business_id: UUID, record_id: UUID, kind: str, title: str, payload: dict, status: str = 'draft') -> dict:
    return _create_opportunity(
        env_id=env_id,
        business_id=business_id,
        pattern_id=None,
        app_record_id=record_id,
        kind=kind,
        title=title,
        payload=payload,
        status=status,
    )


def list_opportunities(*, env_id: str, business_id: UUID, kind: str | None = None, status: str | None = None) -> dict:
    with get_cursor() as cur:
        if not _app_opportunity_table_exists(cur):
            return {'sent_this_week_count': 0, 'rows': []}
        sql = """
            SELECT
                o.*,
                p.pattern_name,
                r.app_name
            FROM cro_app_opportunity o
            LEFT JOIN cro_app_pattern p ON p.id = o.pattern_id
            LEFT JOIN cro_app_record r ON r.id = o.app_record_id
            WHERE o.env_id = %s AND o.business_id = %s
        """
        params: list[object] = [env_id, str(business_id)]
        if kind:
            sql += ' AND o.kind = %s'
            params.append(kind)
        if status:
            sql += ' AND o.status = %s'
            params.append(status)
        sql += ' ORDER BY o.updated_at DESC, o.created_at DESC'
        cur.execute(sql, tuple(params))
        rows = []
        for row in cur.fetchall():
            item = dict(row)
            item['source_label'] = row.get('pattern_name') or row.get('app_name')
            item['source_type'] = 'pattern' if row.get('pattern_id') else 'app_record'
            rows.append(_opportunity_payload(item))
        cur.execute(
            """
            SELECT COUNT(*)::int AS sent_this_week
            FROM cro_app_opportunity
            WHERE env_id = %s
              AND business_id = %s
              AND status = 'sent'
              AND updated_at >= now() - interval '7 days'
            """,
            (env_id, str(business_id)),
        )
        sent_row = cur.fetchone() or {'sent_this_week': 0}
    return {
        'sent_this_week_count': int(sent_row.get('sent_this_week') or 0),
        'rows': rows,
    }


def get_opportunity(*, env_id: str, business_id: UUID, opportunity_id: UUID) -> dict:
    result = list_opportunities(env_id=env_id, business_id=business_id)
    for row in result['rows']:
        if str(row['id']) == str(opportunity_id):
            return row
    raise LookupError(f'Opportunity {opportunity_id} not found')


def update_opportunity(*, env_id: str, business_id: UUID, opportunity_id: UUID, payload: dict) -> dict:
    existing = get_opportunity(env_id=env_id, business_id=business_id, opportunity_id=opportunity_id)
    next_kind = existing['kind']
    next_title = payload.get('title') or existing['title']
    next_payload = payload.get('payload') or existing['payload']
    next_status = payload.get('status') or existing['status']
    _validate_payload(next_kind, next_payload)
    brief_markdown = _render_brief_markdown(next_kind, next_title, next_payload)
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_app_opportunity
            SET title = %s,
                payload = %s::jsonb,
                brief_markdown = %s,
                status = %s,
                updated_at = now()
            WHERE id = %s AND env_id = %s AND business_id = %s
            RETURNING *
            """,
            (
                next_title,
                next_payload,
                brief_markdown,
                next_status,
                str(opportunity_id),
                env_id,
                str(business_id),
            ),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f'Opportunity {opportunity_id} not found')
        sent_hours = _opportunity_to_sent_hours(cur, row['id']) if existing['status'] != 'sent' and next_status == 'sent' else None
    if sent_hours is not None:
        emit_log(
            level='info',
            service='backend',
            action='cro.app_intelligence.opportunity_sent',
            message='App Intelligence opportunity marked sent',
            context={
                'opportunity_id': str(opportunity_id),
                'opportunity_to_sent_hours': sent_hours,
            },
        )
    return get_opportunity(env_id=env_id, business_id=business_id, opportunity_id=opportunity_id)


def get_scoreboard(*, env_id: str, business_id: UUID) -> dict:
    with get_cursor() as cur:
        has_opportunities = _app_opportunity_table_exists(cur)
        if has_opportunities:
            cur.execute(
                """
                SELECT COUNT(*)::int AS cnt
                FROM cro_app_pattern p
                LEFT JOIN (
                    SELECT pattern_id, COUNT(*)::int AS opportunity_count
                    FROM cro_app_opportunity
                    GROUP BY pattern_id
                ) o ON o.pattern_id = p.id
                WHERE p.env_id = %s AND p.business_id = %s
                  AND p.status <> 'archived'
                  AND COALESCE(o.opportunity_count, 0) = 0
                """,
                (env_id, str(business_id)),
            )
            unconverted_patterns = int((cur.fetchone() or {}).get('cnt') or 0)
            cur.execute(
                """
                SELECT COUNT(*)::int AS cnt
                FROM cro_app_record r
                LEFT JOIN (
                    SELECT app_record_id, COUNT(*)::int AS opportunity_count
                    FROM cro_app_opportunity
                    GROUP BY app_record_id
                ) o ON o.app_record_id = r.id
                WHERE r.env_id = %s AND r.business_id = %s
                  AND r.relevance_score >= %s
                  AND r.weakness_score >= %s
                  AND COALESCE(o.opportunity_count, 0) = 0
                """,
                (env_id, str(business_id), PRIME_RELEVANCE_THRESHOLD, PRIME_WEAKNESS_THRESHOLD),
            )
            prime_unsent = int((cur.fetchone() or {}).get('cnt') or 0)
            cur.execute(
                """
                SELECT COUNT(*)::int AS cnt
                FROM cro_app_opportunity
                WHERE env_id = %s AND business_id = %s
                  AND status = 'sent'
                  AND updated_at >= now() - interval '7 days'
                """,
                (env_id, str(business_id)),
            )
            sent_this_week = int((cur.fetchone() or {}).get('cnt') or 0)
            cur.execute(
                """
                SELECT AVG(EXTRACT(EPOCH FROM (o.created_at - i.created_at)) / 3600.0) AS avg_hours
                FROM cro_app_opportunity o
                JOIN cro_app_record r ON r.id = o.app_record_id
                JOIN cro_app_inbox_item i ON i.id = r.inbox_item_id
                WHERE o.env_id = %s AND o.business_id = %s
                """,
                (env_id, str(business_id)),
            )
            avg_inbox = (cur.fetchone() or {}).get('avg_hours')
            cur.execute(
                """
                SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600.0) AS avg_hours
                FROM cro_app_opportunity
                WHERE env_id = %s AND business_id = %s
                  AND status = 'sent'
                """,
                (env_id, str(business_id)),
            )
            avg_sent = (cur.fetchone() or {}).get('avg_hours')
        else:
            cur.execute(
                """
                SELECT COUNT(*)::int AS cnt
                FROM cro_app_pattern
                WHERE env_id = %s AND business_id = %s AND status <> 'archived'
                """,
                (env_id, str(business_id)),
            )
            unconverted_patterns = int((cur.fetchone() or {}).get('cnt') or 0)
            cur.execute(
                """
                SELECT COUNT(*)::int AS cnt
                FROM cro_app_record r
                LEFT JOIN (
                    SELECT app_record_id, COUNT(*)::int AS pattern_count
                    FROM cro_app_pattern_evidence
                    GROUP BY app_record_id
                ) pe ON pe.app_record_id = r.id
                WHERE r.env_id = %s AND r.business_id = %s
                  AND r.relevance_score >= %s
                  AND r.weakness_score >= %s
                  AND COALESCE(pe.pattern_count, 0) = 0
                """,
                (env_id, str(business_id), PRIME_RELEVANCE_THRESHOLD, PRIME_WEAKNESS_THRESHOLD),
            )
            prime_unsent = int((cur.fetchone() or {}).get('cnt') or 0)
            sent_this_week = 0
            avg_inbox = None
            avg_sent = None
    return {
        'unconverted_patterns': unconverted_patterns,
        'prime_unsent': prime_unsent,
        'sent_this_week': sent_this_week,
        'avg_hours_inbox_to_opportunity': float(avg_inbox) if avg_inbox is not None else None,
        'avg_hours_opportunity_to_sent': float(avg_sent) if avg_sent is not None else None,
    }


def get_latest_weekly_memo(*, env_id: str, business_id: UUID) -> dict:
    with get_cursor() as cur:
        if not _app_weekly_memo_table_exists(cur):
            raise LookupError('Weekly memo table is not available')
        cur.execute(
            """
            SELECT *
            FROM cro_app_weekly_memo
            WHERE env_id = %s AND business_id = %s
            ORDER BY period_start DESC, generated_at DESC
            LIMIT 1
            """,
            (env_id, str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError('No weekly memo has been generated yet')
    return _memo_payload(row)
