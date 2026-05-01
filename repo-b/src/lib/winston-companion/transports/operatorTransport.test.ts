import { afterEach, describe, expect, it, vi } from "vitest";
import { streamOperator } from "@/lib/winston-companion/transports/operatorTransport";

describe("operator transport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws instead of returning a fallback answer when operator fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("connection refused");
    }));

    await expect(streamOperator({ message: "hello" })).rejects.toMatchObject({
      errorCode: "WINSTON_OPERATOR_UNAVAILABLE",
    });
  });

  it("throws instead of silently passing when operator is disabled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("disabled", { status: 501 })));

    await expect(streamOperator({ message: "hello" })).rejects.toMatchObject({
      status: 501,
      errorCode: "WINSTON_OPERATOR_UNAVAILABLE",
    });
  });
});
