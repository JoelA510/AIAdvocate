import { safeFetch } from "../safeFetch";

// Minimal Response-like stub so the suite does not depend on a global
// `Response` implementation. safeFetch only reads `.status`, `.ok`, `.text()`.
function makeResponse(status: number, body = ""): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
  } as unknown as Response;
}

describe("safeFetch", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the response on a successful request", async () => {
    const ok = makeResponse(200, "ok");
    fetchMock.mockResolvedValueOnce(ok);

    const res = await safeFetch("https://example.test");

    expect(res).toBe(ok);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on network failure and resolves once a later attempt succeeds", async () => {
    const ok = makeResponse(200, "ok");
    fetchMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(ok);

    const res = await safeFetch("https://example.test", { retries: 3, retryDelayMs: 1 });

    expect(res).toBe(ok);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on HTTP 429 and resolves when the rate limit clears", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(429))
      .mockResolvedValueOnce(makeResponse(200, "ok"));

    const res = await safeFetch("https://example.test", { retries: 3, retryDelayMs: 1 });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a 429 rate-limit error (not 'Unknown error') when retries are exhausted", async () => {
    fetchMock.mockResolvedValue(makeResponse(429));

    await expect(
      safeFetch("https://example.test", { retries: 2, retryDelayMs: 1 }),
    ).rejects.toThrow(/429/);
    // Exactly the requested attempts, with no wasteful retry past the budget.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces the last HTTP error after exhausting retries on non-ok responses", async () => {
    fetchMock.mockResolvedValue(makeResponse(500, "nope"));

    await expect(
      safeFetch("https://example.test", { retries: 2, retryDelayMs: 1 }),
    ).rejects.toThrow(/HTTP 500/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("always makes at least one attempt even when retries < 1", async () => {
    const ok = makeResponse(200, "ok");
    fetchMock.mockResolvedValueOnce(ok);

    const res = await safeFetch("https://example.test", { retries: 0, retryDelayMs: 1 });

    expect(res).toBe(ok);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts an attempt that exceeds timeoutMs and retries", async () => {
    // First attempt hangs until the timeout controller aborts it.
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    fetchMock.mockResolvedValueOnce(makeResponse(200, "ok"));

    const res = await safeFetch("https://example.test", {
      retries: 2,
      retryDelayMs: 1,
      timeoutMs: 5,
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("supports the legacy (init, retries) positional signature", async () => {
    const ok = makeResponse(200, "ok");
    fetchMock.mockResolvedValueOnce(ok);

    const res = await safeFetch("https://example.test", { method: "POST" }, 2);

    expect(res).toBe(ok);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });
});
