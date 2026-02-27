import {
  createOrResetMeridianDemo,
  delegateItem,
  generateTodayBrief,
  getAuditSlice,
  getDelegations,
  getDemoStatus,
  getPayableDetail,
  getQueue,
  getTodayBrief,
  messageAction,
  payableAction,
  resetEccRuntime,
  taskAction,
} from "@/lib/server/eccStore";

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

describe("eccStore", () => {
  beforeEach(() => {
    resetEccRuntime();
    createOrResetMeridianDemo();
  });

  it("creates and resets the Meridian Apex demo with identical deterministic counts", () => {
    const first = getDemoStatus();
    const generalMessage = getQueue().sections.general.find((item) => item.kind === "message");
    expect(generalMessage).toBeTruthy();

    messageAction(generalMessage!.id, {
      action: "mark_done",
    });

    createOrResetMeridianDemo();
    const second = getDemoStatus();

    expect(second.seed_version).toBe(first.seed_version);
    expect(second.counts).toEqual(first.counts);
  });

  it("surfaces non-zero queue sections and escalates a VIP past SLA into red alerts", () => {
    const queue = getQueue();

    expect(queue.counts.red_alerts).toBeGreaterThan(0);
    expect(queue.counts.vip).toBeGreaterThan(0);
    expect(queue.counts.approvals).toBeGreaterThan(0);
    expect(queue.counts.calendar).toBeGreaterThan(0);
    expect(
      queue.sections.red_alerts.some(
        (item) => item.kind === "message" && /capital call timing|pediatric appointment/i.test(item.title)
      )
    ).toBe(true);
  });

  it("approves the $72,000 change order and writes an audit record", () => {
    const changeOrder = getQueue().sections.approvals.find((item) => item.amount === 72_000);
    expect(changeOrder).toBeTruthy();

    const updated = payableAction(changeOrder!.id, {
      action: "approve",
      note: "Approved for demo validation.",
    });

    expect(updated?.status).toBe("approved");
    expect(
      getAuditSlice().some(
        (entry) => entry.entity_id === changeOrder!.id && entry.action === "payable.approve"
      )
    ).toBe(true);
  });

  it("delegates a payable to the controller and updates the linked task", () => {
    const payable = getQueue().sections.approvals.find((item) => item.amount === 72_000);
    expect(payable).toBeTruthy();

    const result = delegateItem({
      item_type: "payable",
      item_id: payable!.id,
      to_user: "Daniel Ortiz",
      due_by: new Date(Date.now() + 60_000).toISOString(),
      context_note: "Own the controller follow-up.",
    });

    expect(result?.delegation.to_user_id).toBeTruthy();
    expect(result?.task.status).toBe("delegated");
    expect(getDelegations().some((row) => row.item_id === payable!.id)).toBe(true);
  });

  it("hides a snoozed item and resurfaces it after the snooze expires", async () => {
    const message = getQueue().sections.general.find((item) => item.kind === "message");
    expect(message).toBeTruthy();

    messageAction(message!.id, {
      action: "snooze_until",
      value: new Date(Date.parse("2026-02-27T14:00:00.000Z") + 120).toISOString(),
    });

    expect(getQueue().sections.general.some((item) => item.id === message!.id)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 180));

    expect(getQueue().sections.general.some((item) => item.id === message!.id)).toBe(true);
  });

  it("links finance matches for the seeded payables and routes two to needs review", () => {
    const approvals = getQueue().sections.approvals;
    const details = approvals.map((item) => getPayableDetail(item.id)).filter(Boolean);
    const highConfidence = details.filter((detail) => (detail?.payable.match_confidence || 0) >= 0.85);
    const needsReview = details.filter((detail) => detail?.payable.status === "needs_review");

    expect(highConfidence.length).toBeGreaterThanOrEqual(3);
    expect(needsReview.length).toBe(2);
  });

  it("computes the morning brief and only returns all clear when the queue is fully cleared", () => {
    const am = getTodayBrief(undefined, "am");
    expect(am.brief.money_summary.due_72h_total).toBeGreaterThan(0);
    expect(am.brief.money_summary.overdue_total).toBeGreaterThan(0);
    expect(am.brief.money_summary.decision_exposure).toBeGreaterThan(0);

    let pm = generateTodayBrief(undefined, "pm");
    expect(pm.brief.body).not.toContain("All clear");

    const clearVisibleQueue = () => {
      const queue = getQueue();
      const messageIds = dedupe(
        [
          ...queue.sections.red_alerts.filter((item) => item.kind === "message").map((item) => item.id),
          ...queue.sections.vip.filter((item) => item.kind === "message").map((item) => item.id),
          ...queue.sections.general.filter((item) => item.kind === "message").map((item) => item.id),
        ]
      );
      const taskIds = dedupe(queue.sections.red_alerts.filter((item) => item.kind === "task").map((item) => item.id));
      const payableIds = dedupe(queue.sections.approvals.map((item) => item.id));

      for (const id of messageIds) {
        messageAction(id, { action: "mark_done" });
      }
      for (const id of taskIds) {
        taskAction(id, { action: "complete" });
      }
      for (const id of payableIds) {
        payableAction(id, { action: "mark_paid", note: "Cleared for PM sweep test." });
      }
    };

    clearVisibleQueue();
    clearVisibleQueue();

    pm = generateTodayBrief(undefined, "pm");
    expect(pm.brief.body).toContain("All clear");
  });
});
