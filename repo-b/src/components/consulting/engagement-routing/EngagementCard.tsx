"use client";

import type { RoutingEngagementListItem } from "@/lib/cro-api";
import { CompoundingBadge, RoutingHealthBadge } from "./RoutingHealthBadge";

const FG_1 = "#E6EDF7";
const FG_2 = "#A9B4C4";
const FG_3 = "#6B7891";
const BORDER = "rgba(105, 120, 145, 0.18)";
const BORDER_ACTIVE = "rgba(0, 229, 255, 0.55)";
const BG_PANEL = "#0E141C";
const BG_PANEL_ACTIVE = "rgba(0, 229, 255, 0.06)";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function EngagementCard({
  item,
  isActive,
  onClick,
}: {
  item: RoutingEngagementListItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const due = fmtDate(item.next_action_due_date);
  const isOverdue =
    item.next_action_due_date != null &&
    new Date(item.next_action_due_date) < new Date(new Date().toDateString());

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        display: "block",
        width: "100%",
        padding: "12px 14px",
        background: isActive ? BG_PANEL_ACTIVE : BG_PANEL,
        borderLeft: `2px solid ${isActive ? BORDER_ACTIVE : "transparent"}`,
        borderTop: `1px solid ${BORDER}`,
        color: FG_1,
        cursor: "pointer",
        fontFamily: "var(--font-plex-sans)",
      }}
      data-testid={`engagement-card-${item.id}`}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: FG_1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.client_name}
          </div>
          <div style={{ fontSize: 11, color: FG_2, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.name}
          </div>
        </div>
        <RoutingHealthBadge health={item.routing_health} />
      </div>

      <div style={{ marginTop: 8 }}>
        <CompoundingBadge health={item.routing_health} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10, fontSize: 11, color: FG_2, fontFamily: "var(--font-jetbrains-mono)" }}>
        <div>
          <div style={{ fontSize: 9, color: FG_3, letterSpacing: "0.12em", textTransform: "uppercase" }}>Value</div>
          <div style={{ color: FG_1 }}>{fmt(item.contract_value)}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: FG_3, letterSpacing: "0.12em", textTransform: "uppercase" }}>Out</div>
          <div style={{ color: item.outstanding_amount > 0 ? "#FFB020" : FG_1 }}>{fmt(item.outstanding_amount)}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8, fontSize: 10, color: FG_3 }}>
        <div>
          <div style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase" }}>Origin</div>
          <div style={{ color: FG_2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.originated_by_user_id || "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase" }}>Owner</div>
          <div style={{ color: FG_2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.relationship_owner_user_id || "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase" }}>Deliv</div>
          <div style={{ color: FG_2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.delivery_owner_user_id || "—"}</div>
        </div>
      </div>

      {item.next_action_text && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${BORDER}`, fontSize: 11, color: FG_2 }}>
          <span style={{ color: FG_3 }}>NEXT </span>
          <span style={{ color: FG_1 }}>{item.next_action_text}</span>
          {due && (
            <span style={{ marginLeft: 8, color: isOverdue ? "#FF3B5C" : FG_3, fontFamily: "var(--font-jetbrains-mono)" }}>
              {isOverdue ? `OVERDUE • ${due}` : due}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
