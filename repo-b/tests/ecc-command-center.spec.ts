import { expect, test } from "@playwright/test";

test("ecc demo works end-to-end on the mobile-first command center", async ({ page, request }) => {
  const create = await request.post("/api/ecc/demo/create_env_meridian_apex");
  expect(create.ok()).toBeTruthy();
  const created = (await create.json()) as {
    env: { env_id: string };
    status: { counts: { messages: number } };
  };
  const envId = created.env.env_id;

  await page.goto(`/lab/env/${envId}/ecc`);

  await expect(page.getByRole("heading", { name: "Red Alerts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "VIP Replies" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everything Else" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Brief" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Search" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  const queueResp = await request.get(`/api/ecc/queue?env_id=${envId}`);
  const queue = (await queueResp.json()) as {
    counts: { red_alerts: number; vip: number; approvals: number; calendar: number };
    sections: {
      red_alerts: Array<{ id: string; kind: string; title: string }>;
      approvals: Array<{ id: string; amount: number | null }>;
    };
  };
  expect(queue.counts.red_alerts).toBeGreaterThan(0);
  expect(queue.counts.vip).toBeGreaterThan(0);
  expect(queue.counts.approvals).toBeGreaterThan(0);
  expect(queue.counts.calendar).toBeGreaterThan(0);
  expect(queue.sections.red_alerts.some((item) => /payroll funding risk/i.test(item.title))).toBeTruthy();

  const changeOrder = queue.sections.approvals.find((item) => item.amount === 72_000);
  expect(changeOrder).toBeTruthy();

  const approveResp = await request.post(`/api/ecc/payable/${changeOrder!.id}`, {
    data: {
      env_id: envId,
      action: "approve",
      note: "Approved in Playwright validation.",
    },
  });
  expect(approveResp.ok()).toBeTruthy();

  const delegateResp = await request.post("/api/ecc/delegate", {
    data: {
      env_id: envId,
      item_type: "payable",
      item_id: changeOrder!.id,
      to_user: "Daniel Ortiz",
      due_by: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      context_note: "Controller follow-up from Playwright.",
    },
  });
  expect(delegateResp.ok()).toBeTruthy();

  const payableResp = await request.get(`/api/ecc/payable/${changeOrder!.id}?env_id=${envId}`);
  const payable = (await payableResp.json()) as {
    payable: { status: string };
    audit: Array<{ action: string }>;
  };
  expect(payable.payable.status).toBe("approved");
  expect(payable.audit.some((entry) => entry.action === "payable.approve")).toBeTruthy();

  const vipMessage = queue.sections.red_alerts.find(
    (item) => item.kind === "message" && /capital call timing/i.test(item.title)
  );
  expect(vipMessage).toBeTruthy();

  const replyResp = await request.post(`/api/ecc/message/${vipMessage!.id}`, {
    data: {
      env_id: envId,
      action: "mark_done",
    },
  });
  expect(replyResp.ok()).toBeTruthy();

  const refreshedQueueResp = await request.get(`/api/ecc/queue?env_id=${envId}`);
  const refreshedQueue = (await refreshedQueueResp.json()) as {
    sections: { red_alerts: Array<{ id: string }> };
  };
  expect(refreshedQueue.sections.red_alerts.some((item) => item.id === vipMessage!.id)).toBeFalsy();

  const briefResp = await request.get(`/api/ecc/brief/today?env_id=${envId}&type=am`);
  const brief = (await briefResp.json()) as {
    brief: {
      money_summary: { due_72h_total: number; overdue_total: number; decision_exposure: number };
    };
  };
  expect(brief.brief.money_summary.due_72h_total).toBeGreaterThan(0);
  expect(brief.brief.money_summary.overdue_total).toBeGreaterThan(0);
  expect(brief.brief.money_summary.decision_exposure).toBeGreaterThan(0);

  const resetResp = await request.post("/api/ecc/demo/reset", {
    data: { env_id: envId },
  });
  expect(resetResp.ok()).toBeTruthy();

  const statusAfterReset = await request.get(`/api/ecc/demo/status?env_id=${envId}`);
  const resetJson = (await statusAfterReset.json()) as { counts: { messages: number } };
  expect(resetJson.counts.messages).toBe(created.status.counts.messages);
});
