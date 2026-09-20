import { describe, expect, it } from "vitest";
import { fetchNewsCandidates } from "@/lib/news/newsroom";
import type { NewsCandidate } from "@/lib/news/candidates/types";
import type { CandidateProvider } from "@/lib/news/providers/types";

function candidate(overrides: Partial<NewsCandidate> = {}): NewsCandidate {
  return {
    id: "id-1",
    fingerprint: "fp-1",
    provider: "gdelt",
    headline: "Lakers beat Celtics in overtime thriller",
    publisherDomain: "example.com",
    sourceQuality: "unknown",
    sourceUrl: "https://example.com/a",
    discoveredAt: new Date().toISOString(),
    queryProfile: "basketball",
    classification: { sport: "basketball", confidence: "high", signals: [] },
    ...overrides,
  };
}

function okProvider(id: "gdelt" | "newsdata" | "local", candidates: NewsCandidate[]): CandidateProvider {
  return {
    id,
    displayName: id,
    requiresApiKey: false,
    expectedFreshness: "unknown",
    async fetchCandidates() {
      return { providerId: id, candidates, status: "ok", durationMs: 5 };
    },
  };
}

function throwingProvider(id: "gdelt" | "newsdata" | "local"): CandidateProvider {
  return {
    id,
    displayName: id,
    requiresApiKey: false,
    expectedFreshness: "unknown",
    async fetchCandidates() {
      throw new Error(`${id} exploded`);
    },
  };
}

describe("fetchNewsCandidates", () => {
  it("preserves provider identity across results", async () => {
    const providers = [
      okProvider("gdelt", [candidate({ id: "a", fingerprint: "a", provider: "gdelt" })]),
      okProvider("newsdata", [candidate({ id: "b", fingerprint: "b", provider: "newsdata" })]),
    ];
    const result = await fetchNewsCandidates({ providers, sport: "basketball", window: "3h", limit: 25 });

    expect(result.providerResults.map((r) => r.providerId).sort()).toEqual(["gdelt", "newsdata"]);
    expect(result.candidates.map((c) => c.provider).sort()).toEqual(["gdelt", "newsdata"]);
  });

  it("does not let one provider throwing destroy another provider's successful results", async () => {
    const providers = [
      okProvider("gdelt", [candidate({ id: "a", fingerprint: "a", provider: "gdelt" })]),
      throwingProvider("newsdata"),
    ];
    const result = await fetchNewsCandidates({ providers, sport: "basketball", window: "3h", limit: 25 });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].provider).toBe("gdelt");

    const newsdataResult = result.providerResults.find((r) => r.providerId === "newsdata");
    expect(newsdataResult?.status).toBe("error");
    expect(newsdataResult?.message).toMatch(/exploded/);
  });

  it("reports an unavailable provider without failing the whole batch", async () => {
    const unavailableProvider: CandidateProvider = {
      id: "newsdata",
      displayName: "newsdata",
      requiresApiKey: true,
      expectedFreshness: "delayed-12h",
      async fetchCandidates() {
        return { providerId: "newsdata", candidates: [], status: "unavailable", message: "missing key", durationMs: 1 };
      },
    };
    const providers = [okProvider("gdelt", [candidate()]), unavailableProvider];
    const result = await fetchNewsCandidates({ providers, sport: "basketball", window: "3h", limit: 25 });

    expect(result.candidates).toHaveLength(1);
    expect(result.providerResults.find((r) => r.providerId === "newsdata")?.status).toBe("unavailable");
  });

  it("flags exact-URL duplicates across the merged, multi-provider batch", async () => {
    const providers = [
      okProvider("gdelt", [
        candidate({ id: "a", fingerprint: "same-url", provider: "gdelt", sourceUrl: "https://example.com/x" }),
      ]),
      okProvider("newsdata", [
        candidate({ id: "b", fingerprint: "same-url", provider: "newsdata", sourceUrl: "https://example.com/x" }),
      ]),
    ];
    const result = await fetchNewsCandidates({ providers, sport: "basketball", window: "3h", limit: 25 });

    expect(result.summary.duplicates).toBe(1);
    expect(result.candidates.filter((c) => c.isDuplicateUrl)).toHaveLength(1);
  });

  it("summarizes candidate counts by classified sport", async () => {
    const providers = [
      okProvider("gdelt", [
        candidate({ id: "a", fingerprint: "a", classification: { sport: "basketball", confidence: "high", signals: [] } }),
        candidate({ id: "b", fingerprint: "b", classification: { sport: "football", confidence: "medium", signals: [] } }),
      ]),
    ];
    const result = await fetchNewsCandidates({ providers, sport: "all", window: "3h", limit: 25 });

    expect(result.summary.bySport.basketball).toBe(1);
    expect(result.summary.bySport.football).toBe(1);
    expect(result.summary.totalCandidates).toBe(2);
  });
});

describe("fetchNewsCandidates — failover, health and intake filtering", () => {
  const providerWithStatus = (
    id: "gdelt" | "newsdata" | "wikipedia-events",
    status: "ok" | "unavailable" | "throttled" | "error",
    candidates: NewsCandidate[] = [],
    message?: string,
  ): CandidateProvider => ({
    id,
    displayName: id,
    requiresApiKey: false,
    expectedFreshness: "unknown",
    async fetchCandidates() {
      return { providerId: id, candidates, status, message, durationMs: 1 };
    },
  });

  it("survives GDELT 429 + NewsData missing key and still returns the working provider's candidates", async () => {
    const providers = [
      providerWithStatus("gdelt", "throttled", [], "429 Too Many Requests"),
      providerWithStatus("newsdata", "unavailable", [], "missing NEWSDATA_API_KEY"),
      providerWithStatus("wikipedia-events", "ok", [candidate({ id: "w", fingerprint: "w", provider: "wikipedia-events" })]),
    ];
    const result = await fetchNewsCandidates({ providers, sport: "all", window: "3h", limit: 25 });

    expect(result.candidates).toHaveLength(1);
    expect(Object.fromEntries(result.health.map((h) => [h.providerId, h.state]))).toEqual({
      gdelt: "throttled",
      newsdata: "unavailable",
      "wikipedia-events": "ok",
    });
  });

  it("distinguishes 'ok but empty' from failures in health reporting", async () => {
    const result = await fetchNewsCandidates({
      providers: [providerWithStatus("gdelt", "ok", [])],
      sport: "all",
      window: "3h",
      limit: 25,
    });
    expect(result.health[0].state).toBe("empty");
  });

  it("rejects junk at intake, keeps the reasons visible, and counts accepted vs returned per provider", async () => {
    const providers = [
      providerWithStatus("gdelt", "ok", [
        candidate({ id: "a", fingerprint: "a" }),
        candidate({ id: "b", fingerprint: "b", headline: "NFL Prop Picks & Week 2 Best Bets" }),
        candidate({ id: "c", fingerprint: "c", headline: "Condensed Game: HCH@LVO - 9/19/26" }),
      ]),
    ];
    const result = await fetchNewsCandidates({ providers, sport: "all", window: "3h", limit: 25 });

    expect(result.candidates.map((c) => c.id)).toEqual(["a"]);
    expect(result.rejected.map((r) => r.candidate.id).sort()).toEqual(["b", "c"]);
    expect(result.summary.rejected).toBe(2);
    expect(result.summary.rejectedByReason["betting-or-fantasy"]).toBe(1);
    expect(result.summary.rejectedByReason["video-page"]).toBe(1);
    expect(result.health[0]).toMatchObject({ returned: 3, accepted: 1 });
  });

  it("flags duplicates only among accepted candidates", async () => {
    const providers = [
      providerWithStatus("gdelt", "ok", [candidate({ id: "a", fingerprint: "same" }), candidate({ id: "b", fingerprint: "same" })]),
    ];
    const result = await fetchNewsCandidates({ providers, sport: "all", window: "3h", limit: 25 });
    expect(result.summary.duplicates).toBe(1);
  });
});
