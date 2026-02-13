import { BMApiClient } from "./apiClient";

const originalFetch = global.fetch;

describe("BMApiClient", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("bm.api.base_url", "http://localhost:8000");
    jest.useRealTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("caches GET requests for ttl duration", async () => {
    const response = { ok: true, rows: [{ id: 1 }] };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(response),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new BMApiClient();
    const first = await client.get<{ ok: boolean; rows: Array<{ id: number }> }>("/v1/excel/schema", 60, false);
    const second = await client.get<{ ok: boolean; rows: Array<{ id: number }> }>("/v1/excel/schema", 60, false);

    expect(first.ok).toBe(true);
    expect(second.rows[0].id).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on transient rate-limit errors", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ detail: "rate limited" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ value: 42 }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new BMApiClient();
    const result = await client.get<{ value: number }>("/v1/excel/metric", 0, true);

    expect(result.value).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws mapped auth error", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ detail: "unauthorized" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new BMApiClient();

    await expect(client.get("/v1/excel/me", 0, true)).rejects.toMatchObject({
      code: "#BM_AUTH!",
    });
  });
});
