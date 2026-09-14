import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newsDataProvider } from "@/lib/news/providers/newsdata/provider";
import { buildNewsDataQuery } from "@/lib/news/providers/newsdata/queries";

describe("buildNewsDataQuery", () => {
  it("ORs terms together and quotes multi-word phrases", () => {
    const query = buildNewsDataQuery("baseball");
    expect(query).toContain("MLB OR");
    expect(query).toContain('"Major League Baseball"');
  });

  it("returns null for a sport with no query profile", () => {
    expect(buildNewsDataQuery("other")).toBeNull();
  });
});

describe("newsDataProvider.fetchCandidates", () => {
  const originalKey = process.env.NEWSDATA_API_KEY;

  beforeEach(() => {
    delete process.env.NEWSDATA_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.NEWSDATA_API_KEY;
    else process.env.NEWSDATA_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("degrades cleanly to an 'unavailable' result when NEWSDATA_API_KEY is missing, without throwing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await newsDataProvider.fetchCandidates({ sport: "basketball", window: "3h", limit: 25 });

    expect(result.status).toBe("unavailable");
    expect(result.message).toMatch(/NEWSDATA_API_KEY/);
    expect(result.candidates).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never reads NEXT_PUBLIC_NEWSDATA_API_KEY as a substitute", async () => {
    process.env.NEXT_PUBLIC_NEWSDATA_API_KEY = "should-not-be-used";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await newsDataProvider.fetchCandidates({ sport: "basketball", window: "3h", limit: 25 });

    expect(result.status).toBe("unavailable");
    delete process.env.NEXT_PUBLIC_NEWSDATA_API_KEY;
  });

  it("fetches and normalizes candidates when a key is configured", async () => {
    process.env.NEWSDATA_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "success",
            results: [
              {
                title: "Lakers agree to trade for All-Star forward, NBA sources say",
                link: "https://example.com/story",
                pubDate: "2026-09-14 12:00:00",
                category: ["sports"],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const result = await newsDataProvider.fetchCandidates({ sport: "basketball", window: "3h", limit: 25 });
    expect(result.status).toBe("ok");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].provider).toBe("newsdata");
  });

  it("never sends the API key in a way that would appear in an error message", async () => {
    process.env.NEWSDATA_API_KEY = "super-secret-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("server error", { status: 500, statusText: "Internal Server Error" })),
    );

    const result = await newsDataProvider.fetchCandidates({ sport: "basketball", window: "3h", limit: 25 });
    expect(result.status).toBe("error");
    expect(result.message).not.toContain("super-secret-key");
  });
});
