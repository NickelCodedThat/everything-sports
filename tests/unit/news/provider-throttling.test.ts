import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gdeltProvider, resetGdeltCooldown } from "@/lib/news/providers/gdelt/provider";
import { newsDataProvider } from "@/lib/news/providers/newsdata/provider";
import { fetchGdeltArticles } from "@/lib/news/providers/gdelt/client";
import { ProviderRateLimitedError, parseRetryAfter } from "@/lib/news/errors";

const tooMany = (headers: Record<string, string> = {}) =>
  new Response("Please limit requests to one every 5 seconds.", { status: 429, statusText: "Too Many Requests", headers });

describe("GDELT throttling (HTTP 429)", () => {
  beforeEach(() => resetGdeltCooldown());
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEWSDATA_API_KEY;
  });

  it("client raises a typed rate-limit error carrying Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tooMany({ "retry-after": "30" })));
    const error = await fetchGdeltArticles({ query: "(NBA)", window: "3h", limit: 5 }).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderRateLimitedError);
    expect(error.retryAfterMs).toBe(30_000);
  });

  it("client treats a 200 plain-text 'limit requests' body as throttling, not malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Please limit requests to one every 5 seconds", { headers: { "content-type": "text/html" } })),
    );
    await expect(fetchGdeltArticles({ query: "(NBA)", window: "3h", limit: 5 })).rejects.toBeInstanceOf(ProviderRateLimitedError);
  });

  it("reports 'throttled' and stops spending requests on the remaining sport profiles", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tooMany());
    vi.stubGlobal("fetch", fetchMock);

    const result = await gdeltProvider.fetchCandidates({ sport: "all", window: "3h", limit: 5 });

    expect(result.status).toBe("throttled");
    expect(result.candidates).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.message).toMatch(/429/);
    expect(result.message).toMatch(/skipped after 429/);
  });

  it("honors a cooldown after a 429: the next call makes no network request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tooMany());
    vi.stubGlobal("fetch", fetchMock);

    await gdeltProvider.fetchCandidates({ sport: "basketball", window: "3h", limit: 5 });
    const second = await gdeltProvider.fetchCandidates({ sport: "basketball", window: "3h", limit: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.status).toBe("throttled");
    expect(second.message).toMatch(/cooldown/i);
  });

  it("recovers once the cooldown has been reset", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tooMany())
      .mockResolvedValueOnce(new Response(JSON.stringify({ articles: [] }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await gdeltProvider.fetchCandidates({ sport: "basketball", window: "3h", limit: 5 });
    resetGdeltCooldown();
    const result = await gdeltProvider.fetchCandidates({ sport: "basketball", window: "3h", limit: 5 });
    expect(result.status).toBe("ok");
    expect(result.candidates).toEqual([]);
  });

  it("reports a malformed-JSON body as an error, not throttling", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{oops", { headers: { "content-type": "application/json" } })));
    const result = await gdeltProvider.fetchCandidates({ sport: "basketball", window: "3h", limit: 5 });
    expect(result.status).toBe("error");
  });

  it("reports a timeout as an error", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    const result = await gdeltProvider.fetchCandidates({ sport: "basketball", window: "3h", limit: 5 });
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/timeout/i);
  });

  it("reports empty results as ok with no candidates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { headers: { "content-type": "application/json" } })));
    const result = await gdeltProvider.fetchCandidates({ sport: "basketball", window: "3h", limit: 5 });
    expect(result).toMatchObject({ status: "ok", candidates: [] });
  });
});

describe("NewsData throttling (HTTP 429)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEWSDATA_API_KEY;
  });

  it("reports 'throttled' without leaking the API key and stops after the first 429", async () => {
    process.env.NEWSDATA_API_KEY = "secret-key-123";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await newsDataProvider.fetchCandidates({ sport: "all", window: "3h", limit: 5 });

    expect(result.status).toBe("throttled");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("secret-key-123");
  });

  it("stays 'unavailable' (not an error) when no key is configured", async () => {
    delete process.env.NEWSDATA_API_KEY;
    const result = await newsDataProvider.fetchCandidates({ sport: "all", window: "3h", limit: 5 });
    expect(result.status).toBe("unavailable");
  });
});

describe("parseRetryAfter", () => {
  it("parses seconds, dates, and rejects junk", () => {
    expect(parseRetryAfter("12")).toBe(12_000);
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter("soon-ish")).toBeUndefined();
    expect(parseRetryAfter(new Date(Date.now() + 5_000).toUTCString())).toBeGreaterThan(0);
  });
});
