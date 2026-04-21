// Frontend DTOs for the Pipeline operating-surface right rail.
// Mirror backend/app/schemas/pipeline_rail.py.

export type TodayMoveReasonCode =
  | "overdue_action_active_deal"
  | "no_action_active_stage"
  | "proposal_no_followup"
  | "high_value_idle"
  | "outreach_ready_for_next_touch"
  | "discovery_no_scheduled_step";

export type TodayMoveRow = {
  id: string;
  deal_id: string;
  account_name: string;
  amount: number | null;
  action: string | null;
  action_type: string | null;
  due: string | null;
  priority_score: number;
  reason_code: TodayMoveReasonCode;
  reason_text: string;
};

export type PipelineRiskHotlistRow = {
  deal_id: string;
  account_name: string;
  amount: number | null;
  stage: string;
  days_since_last_touch: number | null;
};

export type PipelineRisksOut = {
  counts: {
    no_next_action: number;
    stuck_in_outreach: number;
    in_proposal_no_followup: number;
    idle_gt_7d: number;
    drifting: number;
    at_risk: number;
  };
  stage_conversion_weak: Array<{ stage: string; conversion_pct: number }>;
  no_action_hotlist: PipelineRiskHotlistRow[];
};

export type RecentActivityKind =
  | "stage_advanced"
  | "outreach_sent"
  | "reply_received"
  | "meeting_booked"
  | "proposal_sent"
  | "next_action_completed"
  | "next_action_created"
  | "closed_won"
  | "closed_lost";

export type RecentActivityRow = {
  ts: string;
  kind: RecentActivityKind;
  deal_id: string | null;
  account_name: string;
  description: string;
};

export type RecentCloseRow = {
  deal_id: string;
  account_name: string;
  amount: number | null;
  closed_at: string | null;
  loss_reason?: string | null;
};

export type RecentClosesOut = {
  wins: RecentCloseRow[];
  losses: RecentCloseRow[];
  win_total: number;
  loss_total: number;
};

export type OutreachBriefOut = {
  followups_due_today: number;
  no_touch_in_outreach: number;
  touches_this_week: number;
  replies_this_week: number;
  top_vertical_by_response: string;
};
