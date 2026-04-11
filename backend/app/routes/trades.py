from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query

from app.schemas.trades import (
    AccountSummaryOut,
    ClosedPortfolioPositionOut,
    ControlStateOut,
    ExecutionEventOut,
    ExecutionOrderOut,
    KillSwitchRequest,
    OpenPortfolioPositionOut,
    PortfolioAccountabilityOut,
    PortfolioAttributionOut,
    PortfolioDecisionSummaryOut,
    PortfolioSnapshotPointOut,
    ModeChangeRequest,
    PortfolioPositionOut,
    PostTradeReviewCreateRequest,
    PostTradeReviewOut,
    PromotionChecklistOut,
    TradeApprovalRequest,
    TradeCancelRequest,
    TradeIntentCreateRequest,
    TradeIntentOut,
    TradeRiskCheckOut,
    TradeRiskCheckRequest,
    TradeSubmitRequest,
)
from app.services import trades as trades_svc

router = APIRouter(prefix="/api/trades", tags=["trades"])


@router.post("/intents", response_model=TradeIntentOut)
def create_trade_intent(req: TradeIntentCreateRequest):
    return trades_svc.create_trade_intent(req.model_dump())


@router.get("/intents", response_model=list[TradeIntentOut])
def list_trade_intents(
    business_id: UUID = Query(...),
    status: str | None = Query(None),
    env_id: UUID | None = Query(None),
):
    return trades_svc.list_trade_intents(business_id, status=status, env_id=env_id)


@router.get("/intents/{trade_intent_id}", response_model=TradeIntentOut)
def get_trade_intent(trade_intent_id: UUID, business_id: UUID = Query(...)):
    return trades_svc.get_trade_intent(business_id, trade_intent_id)


@router.post("/intents/{trade_intent_id}/risk-check", response_model=TradeRiskCheckOut)
def run_trade_risk_check(trade_intent_id: UUID, req: TradeRiskCheckRequest):
    return trades_svc.run_trade_risk_check(req.business_id, trade_intent_id)


@router.post("/intents/{trade_intent_id}/approve", response_model=TradeIntentOut)
def approve_trade_intent(trade_intent_id: UUID, req: TradeApprovalRequest):
    return trades_svc.approve_trade_intent(
        req.business_id,
        trade_intent_id,
        approved_by=req.approved_by,
        approval_notes=req.approval_notes,
    )


@router.post("/intents/{trade_intent_id}/submit", response_model=ExecutionOrderOut)
def submit_trade_intent(trade_intent_id: UUID, req: TradeSubmitRequest):
    return trades_svc.submit_trade_intent(
        req.business_id,
        trade_intent_id,
        actor=req.actor,
        tif=req.tif,
        broker_name=req.broker,
        broker_account_mode=req.broker_account_mode,
        quantity=req.quantity,
        limit_price=req.limit_price,
        stop_price=req.stop_price,
    )


@router.get("/orders", response_model=list[ExecutionOrderOut])
def list_orders(
    business_id: UUID = Query(...),
    status: str | None = Query(None),
):
    return trades_svc.list_orders(business_id, status=status)


@router.get("/orders/{execution_order_id}", response_model=ExecutionOrderOut)
def get_order(execution_order_id: UUID, business_id: UUID = Query(...)):
    return trades_svc.get_order(business_id, execution_order_id)


@router.post("/orders/{execution_order_id}/cancel", response_model=ExecutionOrderOut)
def cancel_order(execution_order_id: UUID, req: TradeCancelRequest):
    return trades_svc.cancel_order(req.business_id, execution_order_id, actor=req.actor)


@router.get("/positions", response_model=list[PortfolioPositionOut])
def list_positions(
    business_id: UUID = Query(...),
    account_mode: str | None = Query(None),
):
    return trades_svc.list_positions(business_id, account_mode=account_mode)


@router.get("/account-summary", response_model=AccountSummaryOut)
def get_account_summary(business_id: UUID = Query(...)):
    return trades_svc.get_account_summary(business_id)


@router.get("/control-state", response_model=ControlStateOut)
def get_control_state(business_id: UUID = Query(...)):
    return trades_svc.get_control_state(business_id)


@router.post("/kill-switch", response_model=ControlStateOut)
def set_kill_switch(req: KillSwitchRequest):
    return trades_svc.set_kill_switch(
        req.business_id,
        activate=req.activate,
        reason=req.reason,
        changed_by=req.changed_by,
    )


@router.post("/mode", response_model=ControlStateOut)
def set_mode(req: ModeChangeRequest):
    return trades_svc.set_trading_mode(
        req.business_id,
        target_mode=req.target_mode,
        changed_by=req.changed_by,
        reason=req.reason,
        confirmation_phrase=req.confirmation_phrase,
    )


@router.post("/reviews", response_model=PostTradeReviewOut)
def create_review(req: PostTradeReviewCreateRequest):
    return trades_svc.create_post_trade_review(req.model_dump())


@router.get("/reviews", response_model=list[PostTradeReviewOut])
def list_reviews(
    business_id: UUID = Query(...),
    trade_intent_id: UUID | None = Query(None),
):
    return trades_svc.list_post_trade_reviews(business_id, trade_intent_id=trade_intent_id)


@router.get("/promotion-checklist", response_model=PromotionChecklistOut)
def get_promotion_checklist(business_id: UUID = Query(...)):
    return trades_svc.get_promotion_checklist(business_id)


@router.get("/alerts", response_model=list[ExecutionEventOut])
def get_alerts(business_id: UUID = Query(...)):
    return trades_svc.get_alerts(business_id)


@router.get("/portfolio/overview")
def get_portfolio_overview(
    business_id: UUID = Query(...),
    account_mode: str | None = Query(None),
    range_key: str | None = Query(None),
):
    return trades_svc.get_portfolio_overview(business_id, account_mode=account_mode, range_key=range_key)


@router.get("/portfolio/history", response_model=list[PortfolioSnapshotPointOut])
def get_portfolio_history(
    business_id: UUID = Query(...),
    account_mode: str | None = Query(None),
    range_key: str | None = Query(None),
):
    return trades_svc.get_portfolio_history(business_id, account_mode=account_mode, range_key=range_key)


@router.get("/portfolio/positions/open", response_model=list[OpenPortfolioPositionOut])
def get_open_portfolio_positions(
    business_id: UUID = Query(...),
    account_mode: str | None = Query(None),
):
    return trades_svc.list_open_portfolio_positions(business_id, account_mode=account_mode)


@router.get("/portfolio/positions/closed", response_model=list[ClosedPortfolioPositionOut])
def get_closed_portfolio_positions(
    business_id: UUID = Query(...),
    account_mode: str | None = Query(None),
):
    return trades_svc.list_closed_portfolio_positions(business_id, account_mode=account_mode)


@router.get("/portfolio/attribution", response_model=PortfolioAttributionOut)
def get_portfolio_attribution(
    business_id: UUID = Query(...),
    account_mode: str | None = Query(None),
):
    return trades_svc.get_portfolio_attribution(business_id, account_mode=account_mode)


@router.get("/portfolio/accountability", response_model=PortfolioAccountabilityOut)
def get_portfolio_accountability(
    business_id: UUID = Query(...),
):
    return trades_svc.get_portfolio_accountability(business_id)


@router.get("/portfolio/decision", response_model=PortfolioDecisionSummaryOut)
def get_portfolio_decision(
    business_id: UUID = Query(...),
):
    return trades_svc.get_portfolio_decision_summary(business_id)
