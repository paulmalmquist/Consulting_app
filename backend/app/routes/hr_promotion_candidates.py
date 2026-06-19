"""C6 — protected promotion-candidate API.

Thin, admin-gated route layer over the C4 service (`promotion_candidates`). It adds
NO authority: every state change calls the C4 service, and a
`PromotionCandidateError` is surfaced verbatim as an HTTP 409 blocked envelope with
the EXACT C4 reasons. The API never creates episodes, writes episode_embeddings,
calls an LLM, or runs a backfill — `link-promoted-episode` only links an episode id
created elsewhere.

Gate mirrors admin_prompt_receipts.py: authenticated request + `x-bm-platform-admin:
true`; the actor is read from `x-bm-actor` (never the client body).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.auth.platform import require_authenticated_request
from app.services.hr_feature_store import episode_creation as EC
from app.services.hr_feature_store import episode_embedding_creation as EEC
from app.services.hr_feature_store import episode_seal as ESEAL
from app.services.hr_feature_store import promotion_audit as AUDIT
from app.services.hr_feature_store import promotion_candidates as PC

router = APIRouter(prefix="/api/hr/v1/promotion-candidates", tags=["history-rhymes-promotion"])

# Repository factory — overridable in tests via dependency-free monkeypatch.
_repo_factory = PC.DbCandidateRepository

# Audit writer — overridable in tests; None ⇒ governance.record_decision (best-effort).
_audit_writer = None

# Episode-creation repo factory — overridable in tests.
_episode_repo_factory = EC.DbEpisodeRepository

# Episode-embedding repo factory — overridable in tests.
_embedding_repo_factory = EEC.DbEpisodeEmbeddingRepository

# Episode-seal repo factory — overridable in tests.
_seal_repo_factory = ESEAL.DbEpisodeSealRepository


def _repo():
    return _repo_factory()


# --- auth -------------------------------------------------------------------


def _require_admin(request: Request) -> None:
    require_authenticated_request(request)
    header = (request.headers.get("x-bm-platform-admin") or "").strip().lower()
    if header != "true":
        raise HTTPException(status_code=403, detail="Admin access required")


def _actor(request: Request) -> str:
    return (request.headers.get("x-bm-actor") or "").strip()


def _audit(*, action: str, candidate_id: str, actor: str | None, old_status: str | None,
           new_status: str | None, source_route: str, request_payload: dict | None,
           candidate: dict | None, success: bool,
           blocked_reasons: list[str] | None = None,
           allowed_actions: list[str] | None = None) -> str:
    """Build + write a platform audit record. Returns audit_status ("ok"/"failed").
    Best-effort: never raises, never alters the route result."""
    payload = AUDIT.build_audit_payload(
        action=action, candidate_id=candidate_id, actor=actor, old_status=old_status,
        new_status=new_status, source_route=source_route, request_payload=request_payload,
        candidate=candidate, blocked_reasons=blocked_reasons, allowed_actions=allowed_actions,
    )
    try:
        return AUDIT.record_promotion_audit(payload, success=success, writer=_audit_writer)
    except Exception:
        return "failed"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- envelopes --------------------------------------------------------------


def _ok(candidate: dict[str, Any], *, audit_status: str | None = None) -> dict[str, Any]:
    return {
        "status": "ok",
        "candidate_id": candidate.get("candidate_id"),
        "approval_status": candidate.get("approval_status"),
        "candidate": candidate,
        "audit_status": audit_status,
    }


def _blocked(err: PC.PromotionCandidateError, candidate_id: str,
             current_status: str | None, *, audit_status: str | None = None) -> HTTPException:
    # 409 envelope is unchanged except an optional audit_status; blocked_reasons exact.
    return HTTPException(status_code=409, detail={
        "status": "blocked",
        "blocked_reasons": err.reasons,
        "candidate_id": candidate_id,
        "current_status": current_status,
        "allowed_actions": sorted(PC.ALLOWED_TRANSITIONS.get(current_status, set())),
        "audit_status": audit_status,
    })


def _current_status(repo, candidate_id: str) -> str | None:
    c = repo.get(candidate_id)
    return c.get("approval_status") if c else None


def _detail(repo, candidate_id: str) -> dict[str, Any]:
    c = repo.get(candidate_id)
    if c is None:
        raise HTTPException(status_code=404, detail={
            "status": "blocked", "blocked_reasons": ["candidate_not_found"],
            "candidate_id": candidate_id, "current_status": None, "allowed_actions": [],
        })
    c = dict(c)
    c["allowed_actions"] = PC.allowed_actions(c)
    c["blocked_reasons"] = PC.evidence_blockers(c)
    c["coverage"] = PC.non_event_coverage(c)
    return c


# --- payloads ---------------------------------------------------------------


class ApprovePayload(BaseModel):
    reviewer_notes: str | None = None
    override_reason: str | None = None


class RejectPayload(BaseModel):
    rejection_reason: str
    reviewer_notes: str | None = None


class SupersedePayload(BaseModel):
    superseded_by_candidate_id: str
    reviewer_notes: str | None = None


class LinkEpisodePayload(BaseModel):
    created_episode_id: str


class EpisodeFields(BaseModel):
    name: str | None = None
    asset_class: str | None = None
    macro_conditions_entering: str | None = None
    catalyst_trigger: str | None = None
    timeline_narrative: str | None = None
    start_date: str | None = None
    peak_date: str | None = None
    trough_date: str | None = None
    end_date: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    regime_type: str | None = None


class ValidateEpisodePayload(BaseModel):
    episode: EpisodeFields = EpisodeFields()


class CreateEpisodePayload(BaseModel):
    confirm: bool = False
    episode: EpisodeFields = EpisodeFields()
    reviewer_notes: str | None = None


class PlanEmbeddingPayload(BaseModel):
    episode_id: str
    model_version: str = "concat-l2-v1"
    feature_vector: list[float] | None = None


class CreateEmbeddingPayload(BaseModel):
    confirm: bool = False
    episode_id: str
    model_version: str = "concat-l2-v1"
    feature_vector: list[float] | None = None


class SealEpisodePayload(BaseModel):
    confirm: bool = False
    episode_id: str
    model_version: str = "concat-l2-v1"


# --- read routes ------------------------------------------------------------


@router.get("")
def list_candidates(
    request: Request,
    approval_status: str | None = None,
    candidate_type: str | None = None,
    candidate_label: str | None = None,
    condition_cluster: str | None = None,
    source_quality: str | None = None,
    coverage_status: str | None = None,
    as_of_date_from: str | None = None,
    as_of_date_to: str | None = None,
    has_blocked_reasons: bool | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    _require_admin(request)
    repo = _repo()
    rows = PC.list_candidates(repo, status=approval_status, candidate_type=candidate_type)

    def _keep(c: dict[str, Any]) -> bool:
        if candidate_label and c.get("candidate_label") != candidate_label:
            return False
        if condition_cluster and c.get("condition_cluster") != condition_cluster:
            return False
        if source_quality and c.get("source_quality") != source_quality:
            return False
        if as_of_date_from and str(c.get("as_of_date") or "") < as_of_date_from:
            return False
        if as_of_date_to and str(c.get("as_of_date") or "") > as_of_date_to:
            return False
        if coverage_status and PC.non_event_coverage(c).get("coverage_status") != coverage_status:
            return False
        if has_blocked_reasons is not None and bool(PC.evidence_blockers(c)) != has_blocked_reasons:
            return False
        return True

    filtered = [c for c in rows if _keep(c)]
    page = filtered[offset:offset + limit]
    return {"items": page, "count": len(filtered), "limit": limit, "offset": offset}


@router.get("/{candidate_id}")
def get_candidate(request: Request, candidate_id: str) -> dict[str, Any]:
    _require_admin(request)
    return _detail(_repo(), candidate_id)


# --- write routes (delegate to C4; 409 with exact reasons on block) ----------


@router.post("")
def create_candidate(request: Request, candidate: dict[str, Any]) -> dict[str, Any]:
    _require_admin(request)
    repo = _repo()
    cid = candidate.get("candidate_id", "")
    route = str(request.url.path)
    try:
        PC.create_candidate(repo, candidate)
    except PC.PromotionCandidateError as e:
        astatus = _audit(action="create_candidate", candidate_id=cid, actor=_actor(request),
                         old_status=None, new_status=None, source_route=route,
                         request_payload=candidate, candidate=None, success=False,
                         blocked_reasons=e.reasons)
        raise _blocked(e, cid, None, audit_status=astatus)
    after = _detail(repo, candidate["candidate_id"])
    astatus = _audit(action="create_candidate", candidate_id=cid, actor=_actor(request),
                     old_status=None, new_status=after.get("approval_status"), source_route=route,
                     request_payload=candidate, candidate=after, success=True)
    return _ok(after, audit_status=astatus)


def _transition(request: Request, candidate_id: str, action: str, fn,
                request_payload: dict | None = None, **kwargs) -> dict[str, Any]:
    repo = _repo()
    actor = _actor(request)
    before = _current_status(repo, candidate_id)
    route = str(request.url.path)
    try:
        fn(repo, candidate_id, **kwargs)
    except PC.PromotionCandidateError as e:
        # audit the BLOCKED action with exact reasons, then raise the 409 unchanged
        astatus = _audit(action=action, candidate_id=candidate_id, actor=actor,
                         old_status=before, new_status=before, source_route=route,
                         request_payload=request_payload, candidate=repo.get(candidate_id),
                         success=False, blocked_reasons=e.reasons,
                         allowed_actions=sorted(PC.ALLOWED_TRANSITIONS.get(before, set())))
        raise _blocked(e, candidate_id, before, audit_status=astatus)
    after = _detail(repo, candidate_id)
    astatus = _audit(action=action, candidate_id=candidate_id, actor=actor,
                     old_status=before, new_status=after.get("approval_status"),
                     source_route=route, request_payload=request_payload, candidate=after,
                     success=True)
    return _ok(after, audit_status=astatus)


@router.post("/{candidate_id}/needs-evidence")
def needs_evidence(request: Request, candidate_id: str) -> dict[str, Any]:
    _require_admin(request)
    return _transition(request, candidate_id, "mark_needs_evidence", PC.mark_needs_evidence)


@router.post("/{candidate_id}/needs-review")
def needs_review(request: Request, candidate_id: str) -> dict[str, Any]:
    _require_admin(request)
    return _transition(request, candidate_id, "mark_needs_review", PC.mark_needs_review)


@router.post("/{candidate_id}/approve")
def approve(request: Request, candidate_id: str, payload: ApprovePayload) -> dict[str, Any]:
    _require_admin(request)
    actor = _actor(request)
    repo = _repo()
    before = _current_status(repo, candidate_id)
    route = str(request.url.path)
    rp = payload.model_dump()

    def _blocked_audit(reasons: list[str]) -> HTTPException:
        astatus = _audit(action="approve_candidate", candidate_id=candidate_id, actor=actor,
                         old_status=before, new_status=before, source_route=route,
                         request_payload=rp, candidate=repo.get(candidate_id), success=False,
                         blocked_reasons=reasons,
                         allowed_actions=sorted(PC.ALLOWED_TRANSITIONS.get(before, set())))
        return _blocked(PC.PromotionCandidateError(reasons), candidate_id, before, audit_status=astatus)

    # actor missing → surface the same C4 reason rather than a generic 4xx
    if not actor:
        raise _blocked_audit(["missing_approval_actor"])
    if payload.reviewer_notes is not None:
        try:
            PC.attach_evidence(repo, candidate_id, {"reviewer_notes": payload.reviewer_notes})
        except PC.PromotionCandidateError as e:
            raise _blocked_audit(e.reasons)
    try:
        PC.approve_candidate(repo, candidate_id, approval_actor=actor,
                             approval_timestamp=_now(),
                             coverage_override_reason=payload.override_reason)
    except PC.PromotionCandidateError as e:
        raise _blocked_audit(e.reasons)
    after = _detail(repo, candidate_id)
    astatus = _audit(action="approve_candidate", candidate_id=candidate_id, actor=actor,
                     old_status=before, new_status=after.get("approval_status"),
                     source_route=route, request_payload=rp, candidate=after, success=True)
    return _ok(after, audit_status=astatus)


@router.post("/{candidate_id}/reject")
def reject(request: Request, candidate_id: str, payload: RejectPayload) -> dict[str, Any]:
    _require_admin(request)
    return _transition(request, candidate_id, "reject_candidate", PC.reject_candidate,
                       request_payload=payload.model_dump(),
                       rejection_reason=payload.rejection_reason)


@router.post("/{candidate_id}/supersede")
def supersede(request: Request, candidate_id: str, payload: SupersedePayload) -> dict[str, Any]:
    _require_admin(request)
    return _transition(request, candidate_id, "supersede_candidate", PC.supersede_candidate,
                       request_payload=payload.model_dump(),
                       superseded_by_candidate_id=payload.superseded_by_candidate_id)


@router.post("/{candidate_id}/link-promoted-episode")
def link_promoted_episode(request: Request, candidate_id: str,
                          payload: LinkEpisodePayload) -> dict[str, Any]:
    """Link an episode created ELSEWHERE. This route never creates an episode or
    writes an embedding; it only records the link and seals the receipt via C4."""
    _require_admin(request)
    return _transition(request, candidate_id, "link_promoted_episode",
                       PC.record_promoted_episode_link, request_payload=payload.model_dump(),
                       created_episode_id=payload.created_episode_id, promoted_at=_now())


# --- C10: episode creation (no embedding, no seal) ---------------------------


def _episode_repo():
    return _episode_repo_factory()


def _episode_blocked(reasons: list[str], candidate_id: str, status: str | None,
                     audit_status: str | None = None) -> HTTPException:
    return HTTPException(status_code=409, detail={
        "status": "blocked",
        "candidate_id": candidate_id,
        "approval_status": status,
        "blocked_reasons": reasons,
        "allowed_actions": sorted(PC.ALLOWED_TRANSITIONS.get(status, set())),
        "audit_status": audit_status,
    })


@router.post("/{candidate_id}/validate-episode")
def validate_episode(request: Request, candidate_id: str,
                     payload: ValidateEpisodePayload) -> dict[str, Any]:
    """Eligibility + human-authored-field validation. Writes nothing."""
    _require_admin(request)
    erepo = _episode_repo()
    route = str(request.url.path)
    actor = _actor(request)
    status = _current_status(_repo(), candidate_id)
    epi = payload.episode.model_dump(exclude_none=True)
    try:
        result = EC.validate_episode(erepo, candidate_id, epi)
    except EC.EpisodeCreationError as e:
        astatus = _audit(action="episode_validation_blocked", candidate_id=candidate_id,
                         actor=actor, old_status=status, new_status=status, source_route=route,
                         request_payload=epi, candidate=None, success=False, blocked_reasons=e.reasons)
        raise _episode_blocked(e.reasons, candidate_id, status, audit_status=astatus)
    _audit(action="episode_validation_eligible", candidate_id=candidate_id, actor=actor,
           old_status=status, new_status=status, source_route=route, request_payload=epi,
           candidate=None, success=True)
    return result


@router.post("/{candidate_id}/create-episode")
def create_episode(request: Request, candidate_id: str,
                   payload: CreateEpisodePayload) -> dict[str, Any]:
    """Create exactly one episodes row from an approved candidate. Does NOT write an
    embedding, does NOT seal the candidate, does NOT make the episode searchable."""
    _require_admin(request)
    actor = _actor(request)
    erepo = _episode_repo()
    route = str(request.url.path)
    status = _current_status(_repo(), candidate_id)
    epi = payload.episode.model_dump(exclude_none=True)

    if not actor:
        astatus = _audit(action="episode_creation_blocked", candidate_id=candidate_id, actor=None,
                         old_status=status, new_status=status, source_route=route,
                         request_payload=epi, candidate=None, success=False,
                         blocked_reasons=["missing_actor"])
        raise _episode_blocked(["missing_actor"], candidate_id, status, audit_status=astatus)
    if not payload.confirm:
        astatus = _audit(action="episode_creation_blocked", candidate_id=candidate_id, actor=actor,
                         old_status=status, new_status=status, source_route=route,
                         request_payload=epi, candidate=None, success=False,
                         blocked_reasons=["confirmation_required"])
        raise _episode_blocked(["confirmation_required"], candidate_id, status, audit_status=astatus)
    try:
        result = EC.create_episode(erepo, candidate_id, epi)
    except EC.EpisodeCreationError as e:
        astatus = _audit(action="episode_creation_blocked", candidate_id=candidate_id, actor=actor,
                         old_status=status, new_status=status, source_route=route,
                         request_payload=epi, candidate=None, success=False, blocked_reasons=e.reasons)
        raise _episode_blocked(e.reasons, candidate_id, status, audit_status=astatus)

    astatus = _audit(action="episode_created_from_candidate", candidate_id=candidate_id, actor=actor,
                     old_status=status, new_status=status, source_route=route, request_payload=epi,
                     candidate={"created_episode_id": result["episode_id"]}, success=True)
    result["audit_status"] = astatus
    return result


# --- C12: episode-embedding creation (makes the episode searchable; no seal) --


def _embedding_repo():
    return _embedding_repo_factory()


@router.post("/{candidate_id}/plan-episode-embedding")
def plan_episode_embedding(request: Request, candidate_id: str,
                           payload: PlanEmbeddingPayload) -> dict[str, Any]:
    """Dim/dedup/relationship plan for the episode embedding. Writes nothing."""
    _require_admin(request)
    erepo = _embedding_repo()
    route = str(request.url.path)
    actor = _actor(request)
    rp = payload.model_dump(exclude={"feature_vector"})
    try:
        result = EEC.plan_episode_embedding(erepo, candidate_id, episode_id=payload.episode_id,
                                            model_version=payload.model_version,
                                            request_vector=payload.feature_vector)
    except EEC.EpisodeEmbeddingError as e:
        astatus = _audit(action="episode_embedding_planned", candidate_id=candidate_id, actor=actor,
                         old_status=None, new_status=None, source_route=route, request_payload=rp,
                         candidate=None, success=False, blocked_reasons=e.reasons)
        raise _episode_blocked(e.reasons, candidate_id, None, audit_status=astatus)
    _audit(action="episode_embedding_planned", candidate_id=candidate_id, actor=actor,
           old_status=None, new_status=None, source_route=route, request_payload=rp,
           candidate=None, success=True)
    return result


@router.post("/{candidate_id}/create-episode-embedding")
def create_episode_embedding(request: Request, candidate_id: str,
                             payload: CreateEmbeddingPayload) -> dict[str, Any]:
    """Append-only write of one full_state episode_embeddings row → searchable.
    Requires admin + actor + confirm. Does NOT seal the candidate."""
    _require_admin(request)
    actor = _actor(request)
    erepo = _embedding_repo()
    route = str(request.url.path)
    rp = payload.model_dump(exclude={"feature_vector"})

    def _blk(reasons: list[str]) -> HTTPException:
        astatus = _audit(action="episode_embedding_blocked", candidate_id=candidate_id, actor=actor,
                         old_status=None, new_status=None, source_route=route, request_payload=rp,
                         candidate=None, success=False, blocked_reasons=reasons)
        return _episode_blocked(reasons, candidate_id, None, audit_status=astatus)

    if not actor:
        raise _blk(["missing_actor"])
    if not payload.confirm:
        raise _blk(["confirmation_required"])
    try:
        result = EEC.create_episode_embedding(erepo, candidate_id, episode_id=payload.episode_id,
                                              model_version=payload.model_version,
                                              request_vector=payload.feature_vector)
    except EEC.EpisodeEmbeddingError as e:
        raise _blk(e.reasons)
    astatus = _audit(action="episode_embedding_created", candidate_id=candidate_id, actor=actor,
                     old_status=None, new_status=None, source_route=route, request_payload=rp,
                     candidate={"created_episode_id": result["episode_id"]}, success=True)
    result["audit_status"] = astatus
    return result


# --- C13: seal promoted episode candidate (C4 link; promoted is terminal) -----


def _seal_repo():
    return _seal_repo_factory()


@router.post("/{candidate_id}/seal-promoted-episode")
def seal_promoted_episode(request: Request, candidate_id: str,
                          payload: SealEpisodePayload) -> dict[str, Any]:
    """Seal an approved candidate as promoted once its episode + embedding exist.
    Requires admin + actor + confirm. Delegates the state change to the C4 service
    (record_promoted_episode_link); promoted is terminal."""
    _require_admin(request)
    actor = _actor(request)
    repo = _seal_repo()
    route = str(request.url.path)
    before = _current_status(_repo(), candidate_id)
    rp = payload.model_dump()

    def _blk(reasons: list[str]) -> HTTPException:
        astatus = _audit(action="candidate_promoted_sealed", candidate_id=candidate_id, actor=actor,
                         old_status=before, new_status=before, source_route=route, request_payload=rp,
                         candidate=None, success=False, blocked_reasons=reasons)
        return _episode_blocked(reasons, candidate_id, before, audit_status=astatus)

    if not actor:
        raise _blk(["missing_actor"])
    if not payload.confirm:
        raise _blk(["confirmation_required"])
    try:
        result = ESEAL.seal_promoted_episode(repo, candidate_id, episode_id=payload.episode_id,
                                             model_version=payload.model_version, resolved_at=_now())
    except ESEAL.EpisodeSealError as e:
        raise _blk(e.reasons)
    astatus = _audit(action="candidate_promoted_sealed", candidate_id=candidate_id, actor=actor,
                     old_status=before, new_status="promoted", source_route=route, request_payload=rp,
                     candidate={"created_episode_id": result["episode_id"]}, success=True)
    result["audit_status"] = astatus
    return result
