import styles from "@/app/(marketing)/ai-concierge/control-board.module.css";

export type AIControlBoardReceipt = {
  model: string;
  tokens: string;
  skill: string;
  approver: string;
  source: string;
  timestamp: string;
  trace: string;
};

export type AIControlBoardSprawlChip = {
  label: string;
  faded?: boolean;
  shape?: "chip" | "rect" | "pill";
  /** Percentages of the sprawl field; lets each chip sit off-grid. */
  offset: { left: string; top: string };
};

export type AIControlBoardRoutingRow = {
  request: string;
  skill: string;
  status: "live" | "review" | "logged";
};

export type AIControlBoardProps = {
  receipt?: AIControlBoardReceipt;
  destinations?: readonly string[];
  sprawlChips?: readonly AIControlBoardSprawlChip[];
  routingRows?: readonly AIControlBoardRoutingRow[];
};

const defaultReceipt: AIControlBoardReceipt = {
  model: "gpt-4.1",
  tokens: "18,420",
  skill: "variance-review",
  approver: "finance-owner",
  source: "erp.actuals",
  timestamp: "2026-05-07 09:14 UTC",
  trace: "nv-48291",
};

const defaultDestinations: readonly string[] = [
  "Skills",
  "Models",
  "Tokens",
  "Systems",
  "Approvals",
  "Audit log",
];

// Inconsistent labels are intentional — sprawl should look like sprawl.
const defaultSprawlChips: readonly AIControlBoardSprawlChip[] = [
  { label: "copilot",         shape: "chip", offset: { left: "4%",  top: "6%"  } },
  { label: "Spreadsheet macro", shape: "rect", faded: true, offset: { left: "38%", top: "18%" } },
  { label: "Team Prompt",     shape: "pill", offset: { left: "10%", top: "34%" } },
  { label: "one-off agent",   shape: "chip", faded: true, offset: { left: "46%", top: "48%" } },
  { label: "browser-plugin",  shape: "rect", offset: { left: "2%",  top: "62%" } },
  { label: "notebook.py",     shape: "chip", faded: true, offset: { left: "34%", top: "78%" } },
];

const defaultRoutingRows: readonly AIControlBoardRoutingRow[] = [
  { request: "Review variance exceptions",   skill: "variance-review",   status: "live" },
  { request: "Draft capital-call escalation", skill: "exception-escalate", status: "review" },
  { request: "Reconcile vendor invoices",    skill: "ap-reconcile",      status: "logged" },
  { request: "Summarize quarterly NOI",      skill: "noi-summary",       status: "logged" },
];

const sprawlShapeClass: Record<NonNullable<AIControlBoardSprawlChip["shape"]>, string> = {
  chip: styles.sprawlShapeChip,
  rect: styles.sprawlShapeRect,
  pill: styles.sprawlShapePill,
};

const statusClass: Record<AIControlBoardRoutingRow["status"], string> = {
  live: styles.statusLive,
  review: styles.statusReview,
  logged: styles.statusLogged,
};

export function AIControlBoard({
  receipt = defaultReceipt,
  destinations = defaultDestinations,
  sprawlChips = defaultSprawlChips,
  routingRows = defaultRoutingRows,
}: AIControlBoardProps = {}) {
  return (
    <div className={styles.board} role="img" aria-label="Novendor operating layer routing scattered AI work into governed destinations">
      <div className={styles.sprawl}>
        <p className={styles.colLabel}>Sprawl · today</p>
        <div className={styles.sprawlField}>
          {sprawlChips.map((chip) => (
            <span
              key={chip.label}
              className={[
                styles.sprawlChip,
                sprawlShapeClass[chip.shape ?? "chip"],
                chip.faded ? styles.faded : "",
              ].filter(Boolean).join(" ")}
              style={{ left: chip.offset.left, top: chip.offset.top }}
            >
              {chip.label}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.spine}>
        <p className={styles.spineHeader}>Novendor · operating layer</p>
        <div className={styles.spineRows}>
          {routingRows.map((row) => (
            <div key={row.request} className={styles.spineRow}>
              <span className={styles.request}>
                <span className={`${styles.statusDot} ${statusClass[row.status]}`} aria-hidden />
                {row.request}
              </span>
              <span className={styles.skill}>{row.skill}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.destinations}>
        <p className={styles.colLabel}>Governed destinations</p>
        {destinations.map((name) => (
          <div key={name} className={styles.destination}>
            <span>{name}</span>
            <span className={styles.destinationMark} aria-hidden />
          </div>
        ))}
      </div>

      <div className={styles.receipt}>
        <div className={styles.receiptCell}>
          <span className={styles.receiptLabel}>Model</span>
          <span className={styles.receiptValue}>{receipt.model}</span>
        </div>
        <div className={styles.receiptCell}>
          <span className={styles.receiptLabel}>Tokens</span>
          <span className={styles.receiptValue}>{receipt.tokens}</span>
        </div>
        <div className={styles.receiptCell}>
          <span className={styles.receiptLabel}>Skill</span>
          <span className={styles.receiptValue}>{receipt.skill}</span>
        </div>
        <div className={styles.receiptCell}>
          <span className={styles.receiptLabel}>Approver</span>
          <span className={`${styles.receiptValue} ${styles.receiptValueApprover}`}>{receipt.approver}</span>
        </div>
        <div className={styles.receiptCell}>
          <span className={styles.receiptLabel}>Source</span>
          <span className={styles.receiptValue}>{receipt.source}</span>
        </div>
        <div className={styles.receiptCell}>
          <span className={styles.receiptLabel}>Timestamp</span>
          <span className={styles.receiptValue}>{receipt.timestamp}</span>
        </div>
        <div className={styles.receiptCell}>
          <span className={styles.receiptLabel}>Trace</span>
          <span className={`${styles.receiptValue} ${styles.receiptValueTrace}`}>{receipt.trace}</span>
        </div>
      </div>
    </div>
  );
}
