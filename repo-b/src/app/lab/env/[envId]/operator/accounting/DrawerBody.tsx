"use client";

import { Badge, Button, Caps, fmtUSD } from "@/components/operator/command-desk";
import type { NvQueueItem } from "@/types/nv-accounting";
import { TYPE_META } from "./columns";

type DrawerBodyProps = {
  item: NvQueueItem;
  onAction: (
    action: "accept" | "defer" | "reject",
    variant?: string,
  ) => void;
};

function TraceTree({ item }: { item: NvQueueItem }) {
  const lines = buildTrace(item);
  return (
    <div
      style={{
        marginTop: 6,
        display: "flex",
        flexDirection: "column",
        gap: 3,
        color: "var(--fg-2)",
      }}
    >
      {lines.map((l, i) => (
        <div key={i} dangerouslySetInnerHTML={{ __html: l }} />
      ))}
    </div>
  );
}

function buildTrace(item: NvQueueItem): string[] {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (item.type === "overdue-invoice") {
    return [
      `├─ issued · <span style="color:var(--fg-1)">${esc(item.date)}</span>`,
      `├─ sent · <span style="color:var(--sem-up)">delivered</span>`,
      `├─ reminder · <span style="color:var(--neon-amber)">auto · ${esc(item.age)} ago</span>`,
      `└─ overdue · <span style="color:var(--sem-error)">escalate to collections</span>`,
    ];
  }
  if (item.type === "review-receipt") {
    return [
      `├─ received · <span style="color:var(--fg-1)">${esc(item.date)}</span>`,
      `├─ ocr · <span style="color:var(--sem-up)">extracted · confidence ${esc(item.state)}</span>`,
      `├─ vendor · <span style="color:var(--fg-1)">${esc(item.party)}</span>`,
      `└─ awaiting · <span style="color:var(--neon-cyan)">human review</span>`,
    ];
  }
  if (item.type === "match-receipt") {
    return [
      `├─ txn · <span style="color:var(--fg-1)">${esc(item.party)}</span>`,
      `├─ candidates · <span style="color:var(--neon-amber)">${esc(item.state)}</span>`,
      `└─ awaiting · <span style="color:var(--neon-cyan)">match confirmation</span>`,
    ];
  }
  if (item.type === "categorize") {
    return [
      `├─ txn · <span style="color:var(--fg-1)">${esc(item.party)}</span>`,
      `├─ categorize · <span style="color:var(--neon-amber)">pending</span>`,
      `└─ awaiting · <span style="color:var(--neon-cyan)">category pick</span>`,
    ];
  }
  return [
    `├─ submitted · <span style="color:var(--fg-1)">${esc(item.date)}</span>`,
    `├─ by · <span style="color:var(--fg-1)">${esc(item.party)}</span>`,
    `└─ awaiting · <span style="color:var(--neon-cyan)">approval</span>`,
  ];
}

export function DrawerBody({ item, onAction }: DrawerBodyProps) {
  const m = TYPE_META[item.type];
  return (
    <>
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--line-2)",
          background: "var(--bg-panel-2)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Caps color={m?.color ?? "var(--fg-2)"}>
            {(m?.label ?? item.type)} · {item.id}
          </Caps>
        </div>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 16,
            color: "var(--fg-1)",
            fontWeight: 500,
          }}
        >
          {item.action}
        </div>
        <div style={{ color: "var(--fg-3)", marginTop: 4 }}>
          {item.party} · {item.date} · {item.time}
        </div>
      </div>
      <div style={{ padding: 14, borderBottom: "1px solid var(--line-1)" }}>
        <Caps>AMOUNT</Caps>
        <div
          style={{
            fontSize: 28,
            color: item.state_tone === "error" ? "var(--sem-down)" : "var(--fg-1)",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-.02em",
            marginTop: 2,
          }}
        >
          {fmtUSD(item.amount)}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "var(--fg-3)",
            marginTop: 4,
          }}
        >
          <span>state</span>
          <Badge tone={item.state_tone} size="sm" glow={item.glow}>
            {item.state}
          </Badge>
        </div>
      </div>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-1)" }}>
        <Caps>LINKED TO</Caps>
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4, color: "var(--fg-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>client</span>
            <span style={{ color: "var(--fg-1)" }}>{item.client}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>counterparty</span>
            <span style={{ color: "var(--fg-1)" }}>{item.party}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>age in queue</span>
            <span
              style={{
                color: item.state_tone === "error" ? "var(--sem-down)" : "var(--fg-1)",
              }}
            >
              {item.age}
            </span>
          </div>
          {item.source_intake_id && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>intake</span>
              <span style={{ color: "var(--fg-1)" }}>{item.source_intake_id.slice(0, 8)}</span>
            </div>
          )}
          {item.source_invoice_id && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>invoice</span>
              <span style={{ color: "var(--fg-1)" }}>{item.source_invoice_id.slice(0, 8)}</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-1)" }}>
        <Caps>TRACE</Caps>
        <TraceTree item={item} />
      </div>
      <div style={{ padding: "12px 14px" }}>
        <Caps color="var(--neon-cyan)">AI SUGGESTED</Caps>
        <div style={{ marginTop: 8, color: "var(--fg-3)", fontSize: 10 }}>
          {item.type === "categorize" ? (
            <div>Top-3 category candidates load from <code>/nv_expense_categorizer</code>.</div>
          ) : item.type === "match-receipt" ? (
            <div>Candidate receipts load from <code>/nv_transaction_matcher</code>.</div>
          ) : (
            <div>No suggestions for this item type.</div>
          )}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      {/* action row lives in the DetailDrawer footer */}
      <Footer item={item} onAction={onAction} />
    </>
  );
}

function Footer({ item, onAction }: DrawerBodyProps) {
  // Footer is rendered inside DetailDrawer's footer slot below,
  // but we inline action buttons here for the body fallback when footer isn't used.
  return null;
}

export function DrawerFooter({ item, onAction }: DrawerBodyProps) {
  return (
    <>
      {item.type === "overdue-invoice" && (
        <>
          <Button kind="primary" size="sm" onClick={() => onAction("accept", "remind")}>Send reminder</Button>
          <Button kind="danger" size="sm" onClick={() => onAction("reject", "escalate")}>Escalate</Button>
        </>
      )}
      {item.type === "review-receipt" && (
        <>
          <Button kind="primary" size="sm" onClick={() => onAction("accept", "parse")}>Accept parse</Button>
          <Button kind="secondary" size="sm" onClick={() => onAction("defer", "edit")}>Edit fields</Button>
        </>
      )}
      {item.type === "match-receipt" && (
        <>
          <Button kind="primary" size="sm" onClick={() => onAction("accept", "top-match")}>Accept top match</Button>
          <Button kind="secondary" size="sm" onClick={() => onAction("defer", "manual")}>Manual</Button>
        </>
      )}
      {item.type === "categorize" && (
        <>
          <Button kind="primary" size="sm" onClick={() => onAction("accept", "category")}>Accept</Button>
          <Button kind="secondary" size="sm" onClick={() => onAction("defer", "split")}>Split</Button>
        </>
      )}
      {item.type === "reimbursable" && (
        <>
          <Button kind="primary" size="sm" onClick={() => onAction("accept", "approve")}>Approve</Button>
          <Button kind="danger" size="sm" onClick={() => onAction("reject", "reject")}>Reject</Button>
        </>
      )}
      <Button kind="ghost" size="sm" onClick={() => onAction("defer")}>Defer</Button>
      <div style={{ flex: 1 }} />
      <Button kind="ghost" size="sm" onClick={() => onAction("defer", "open")}>Open ›</Button>
    </>
  );
}
