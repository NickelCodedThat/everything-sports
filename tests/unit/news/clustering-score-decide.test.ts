import { describe, expect, it } from "vitest";
import { decide, type ClusterableCandidate, type Neighbor } from "@/lib/news/clustering/decide";
import { extractFeatures } from "@/lib/news/clustering/features";
import { scorePair, type PairInput } from "@/lib/news/clustering/score";

// Every headline is invented. Trigram similarity is supplied by the test (in production it comes from pg_trgm).

const T0 = new Date("2026-09-20T05:00:00Z");
const hoursLater = (h: number) => new Date(T0.getTime() + h * 3_600_000);

function pair(a: string, b: string, over: Partial<PairInput> = {}): ReturnType<typeof scorePair> {
  return scorePair({
    similarity: 0.6,
    wordSimilarity: 0.7,
    a: extractFeatures(a),
    b: extractFeatures(b),
    sportA: "baseball",
    sportB: "baseball",
    leagueA: null,
    leagueB: null,
    hoursApart: 1,
    ...over,
  });
}

describe("pair scoring and confidence", () => {
  it("HIGH: very similar wording, shared entities, same event type", () => {
    const e = pair("Pavin Smith's walk-off homer lifts D-backs over Yankees", "Pavin Smith's pinch-hit, walk-off homer lifts D-backs over Yankees", { similarity: 0.85 });
    expect(e.confidence).toBe("high");
    expect(e.route).toBe("fuzzy-headline");
    expect(e.sharedTeams).toEqual(["diamondbacks", "yankees"]);
    expect(e.contradictions).toEqual([]);
  });

  it("HIGH by entity overlap: same two teams and same event type despite different wording", () => {
    const e = pair("Rookie Salas lifts Padres past Marlins in 10 innings", "Ekness squanders heroics as Padres walk off Marlins in 10", { similarity: 0.3, wordSimilarity: 0.4 });
    expect(e.confidence).toBe("high");
    expect(e.route).toBe("entity-overlap");
  });

  it("HIGH by two shared named people in individual sports (both fighters), when the event agrees", () => {
    const e = pair(
      "UFC 331: Joshua Van outlasts Alexandre Pantoja to retain flyweight title",
      "Alexandre Pantoja goes all out but fails to dethrone Joshua Van for the flyweight belt as the challenger outlasts",
      { similarity: 0.4, wordSimilarity: 0.5, sportA: "mma", sportB: "mma" },
    );
    expect(e.sharedNames.sort()).toEqual(["pantoja", "van"]);
    expect(e.confidence).toBe("high");
    expect(e.route).toBe("entity-overlap");
  });

  it("does not merge on ONE shared named person alone (same fighter, different fights)", () => {
    const e = pair("Alexandre Pantoja outlasts Joshua Van to retain the title", "Alexandre Pantoja beats Brandon Royval in a rematch", { similarity: 0.45, wordSimilarity: 0.5, sportA: "mma", sportB: "mma" });
    expect(e.route).toBeNull();
  });

  it("never merges a shared team across event types: a trade is not a game result", () => {
    const e = pair("Lakers trade guard to the Suns", "Lakers defeat Warriors in overtime", { similarity: 0.5, sportA: "basketball", sportB: "basketball" });
    expect(e.blocked).toBe(true);
    expect(e.confidence).toBe("low");
    expect(e.contradictions.map((c) => c.code)).toContain("event-type-conflict");
  });

  it("does not auto-merge two previews of the same game on entity overlap alone (queued as MEDIUM)", () => {
    const e = pair("Cubs-Reds predictions: keys to victory", "How to watch Cubs vs. Reds: TV channel and live stream", { similarity: 0.2, wordSimilarity: 0.3 });
    expect(e.eventAgreement).toBe("same");
    expect(e.route).toBeNull();
    expect(e.confidence).toBe("medium");
  });

  it("still merges near-identical previews by wording (syndicated copies)", () => {
    const e = pair("How to watch Cubs vs. Reds: TV channel and live stream", "How to watch Cubs vs. Reds: TV channel and live stream today", { similarity: 0.9 });
    expect(e.confidence).toBe("high");
  });

  it("blocks a preview from merging with the result it previews", () => {
    const e = pair("Owls vs. Herons: lineups and how to watch", "Owls edge Herons in extra innings", { similarity: 0.7 });
    expect(e.blocked).toBe(true);
  });

  it("blocks the same team playing a different opponent", () => {
    const e = pair("Padres beat Marlins 4-2", "Padres beat Rockies 3-1", { similarity: 0.8 });
    expect(e.blocked).toBe(true);
    expect(e.contradictions.map((c) => c.code)).toEqual(expect.arrayContaining(["different-opponent", "score-mismatch"]));
  });

  it("blocks conflicting final scores even between the same two teams (a different game in the series)", () => {
    const e = pair("Cubs beat Reds 5-2", "Cubs beat Reds 8-1", { similarity: 0.9 });
    expect(e.blocked).toBe(true);
    expect(e.contradictions.map((c) => c.code)).toContain("score-mismatch");
  });

  it("does not treat a missing score or a differently ordered score as a conflict", () => {
    expect(pair("Cubs beat Reds 5-2", "Cubs beat Reds", { similarity: 0.9 }).blocked).toBe(false);
    expect(pair("Cubs beat Reds 5-2", "Reds fall to Cubs, 2-5", { similarity: 0.6 }).blocked).toBe(false);
  });

  it("blocks headlines outside the event window", () => {
    const e = pair("Cubs beat Reds", "Cubs beat Reds", { similarity: 1, hoursApart: 30 });
    expect(e.blocked).toBe(true);
    expect(e.contradictions.map((c) => c.code)).toContain("outside-time-window");
  });

  it("blocks disjoint teams and mismatched leagues", () => {
    expect(pair("Cubs beat Reds", "Braves beat Mets", { similarity: 0.7 }).contradictions.map((c) => c.code)).toContain("team-mismatch");
    expect(pair("Cubs beat Reds", "Cubs beat Reds", { similarity: 1, leagueA: "MLB", leagueB: "NCAA" }).contradictions.map((c) => c.code)).toContain("league-mismatch");
  });

  it("downgrades (HIGH → MEDIUM) when different people are involved in a person-sensitive event", () => {
    const e = pair("Cubs will rule out Marcus Ruiz for the game with a hamstring strain vs. Reds", "Cubs will rule out Devon Carter for the game with a sore knee vs. Reds", { similarity: 0.85 });
    expect(e.contradictions.map((c) => c.code)).toContain("person-mismatch");
    expect(e.confidence).toBe("medium");
    expect(e.route).toBeNull();
  });

  it("downgrades when reported dollar amounts differ", () => {
    const e = pair("Cubs sign Marcus Ruiz to $50 million deal", "Cubs sign Marcus Ruiz to $80 million deal", { similarity: 0.9 });
    expect(e.contradictions.map((c) => c.code)).toContain("amount-mismatch");
    expect(e.confidence).toBe("medium");
  });

  it("MEDIUM (near miss) when the event type is unclear but both teams match", () => {
    const e = pair("Yankees vs. Diamondbacks discussion", "Pavin Smith's walk-off homer lifts D-backs over Yankees", { similarity: 0.3 });
    expect(e.confidence).toBe("medium");
    expect(e.route).toBeNull();
  });

  it("LOW: weak headline similarity with no shared entity", () => {
    expect(pair("Thoughts on the weekend", "Owls insider notes", { similarity: 0.4 }).confidence).toBe("low");
  });

  it("is deterministic and keeps the score in 0..1", () => {
    const a = pair("Cubs beat Reds 5-2", "Cubs beat Reds", { similarity: 0.9 });
    const b = pair("Cubs beat Reds 5-2", "Cubs beat Reds", { similarity: 0.9 });
    expect(a).toEqual(b);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(1);
  });

  it("caps a blocked pair's score so it can never outrank a real match", () => {
    expect(pair("Cubs beat Reds 5-2", "Cubs beat Reds 8-1", { similarity: 0.95 }).score).toBeLessThanOrEqual(0.2);
  });
});

function candidate(over: Partial<ClusterableCandidate> & { headline: string }): ClusterableCandidate {
  return {
    id: "c-new",
    normalizedHeadline: over.headline.toLowerCase(),
    headlineKind: "publisher-title",
    sport: "baseball",
    league: null,
    sourceId: 1,
    sourceDomain: "new.example",
    publishedAt: T0,
    discoveredAt: T0,
    ...over,
  };
}

function neighbor(over: Partial<Neighbor> & { headline: string }): Neighbor {
  return {
    candidateId: "c-old",
    headlineKind: "publisher-title",
    sport: "baseball",
    league: null,
    sourceDomain: "old.example",
    freshAt: T0,
    clusterId: "cluster-a",
    clusterFirstFreshAt: T0,
    clusterLastFreshAt: T0,
    clusterEventType: null,
    similarity: 0.5,
    wordSimilarity: 0.5,
    exactHeadline: false,
    ...over,
  };
}

const features = (h: string) => extractFeatures(h);

describe("decide()", () => {
  it("joins the cluster of an identical headline (exact-headline, HIGH, score 1)", () => {
    const d = decide(candidate({ headline: "Cubs top Reds" }), [neighbor({ headline: "Cubs top Reds", exactHeadline: true, similarity: 1 })], features);
    expect(d).toMatchObject({ action: "join", clusterId: "cluster-a", method: "exact-headline", confidence: "high", score: 1 });
  });

  it("does not join an identical headline outside the exact window (an old event is not this event)", () => {
    const d = decide(candidate({ headline: "Cubs top Reds" }), [neighbor({ headline: "Cubs top Reds", exactHeadline: true, similarity: 1, freshAt: hoursLater(-72) })], features);
    expect(d.action).toBe("create");
  });

  it("does not join identical text labelled as a different sport, and surfaces it for review", () => {
    const d = decide(candidate({ headline: "Cubs top Reds", sport: "football" }), [neighbor({ headline: "Cubs top Reds", exactHeadline: true, similarity: 1, sport: "baseball" })], features);
    expect(d.action).toBe("create");
    expect(d.ambiguous.map((a) => a.reason)).toEqual(["exact-headline-sport-mismatch"]);
  });

  it("tolerates an unknown/other sport label on identical text", () => {
    const d = decide(candidate({ headline: "Cubs top Reds", sport: "unknown" }), [neighbor({ headline: "Cubs top Reds", exactHeadline: true, similarity: 1 })], features);
    expect(d.action).toBe("join");
  });

  it("never fuzzy-matches discovery text; unmatched discovery text seeds its own cluster", () => {
    const d = decide(
      candidate({ headline: "In baseball, the Pirates beat the Royals 6-5", headlineKind: "discovery-text" }),
      [neighbor({ headline: "Pirates beat Royals 6-5", similarity: 0.9 })],
      features,
    );
    expect(d).toMatchObject({ action: "create", method: "seed" });
    expect((d.evidence as { reason: string }).reason).toBe("discovery-text-exact-only");
  });

  it("joins the best HIGH fuzzy match and records why", () => {
    const d = decide(
      candidate({ headline: "Pavin Smith's walk-off homer lifts D-backs over Yankees" }),
      [neighbor({ headline: "Pavin Smith's pinch-hit, walk-off homer lifts D-backs over Yankees", similarity: 0.85 })],
      features,
    );
    expect(d).toMatchObject({ action: "join", clusterId: "cluster-a", method: "fuzzy-headline", confidence: "high" });
    expect(d.evidence).toMatchObject({ matchedHeadline: expect.any(String), similarity: 0.85, algorithm: expect.any(String) });
  });

  it("seeds a new cluster (not a merge) when only a MEDIUM match exists, and queues the near miss", () => {
    const d = decide(
      candidate({ headline: "Yankees vs. Diamondbacks discussion" }),
      [neighbor({ headline: "Pavin Smith's walk-off homer lifts D-backs over Yankees", similarity: 0.3 })],
      features,
    );
    expect(d.action).toBe("create");
    expect(d.ambiguous).toHaveLength(1);
    expect(d.ambiguous[0]).toMatchObject({ clusterId: "cluster-a", confidence: "medium", reason: "medium-confidence-match" });
  });

  it("does not queue blocked pairs as near misses (they are correct non-merges)", () => {
    const d = decide(candidate({ headline: "Lakers trade guard to the Suns", sport: "basketball" }), [neighbor({ headline: "Lakers defeat Warriors in overtime", sport: "basketball", similarity: 0.5 })], features);
    expect(d.action).toBe("create");
    expect(d.ambiguous).toEqual([]);
  });

  it("ignores neighbours that are not in any cluster and neighbours of another sport", () => {
    const d = decide(
      candidate({ headline: "Cubs beat Reds 5-2" }),
      [
        neighbor({ headline: "Cubs beat Reds 5-2", clusterId: null, similarity: 0.95 }),
        neighbor({ headline: "Cubs beat Reds 5-2", sport: "football", clusterId: "cluster-b", similarity: 0.95 }),
      ],
      features,
    );
    expect(d.action).toBe("create");
  });

  it("blocks a join that would stretch a cluster past twice the pair window (no slow chaining)", () => {
    const d = decide(
      candidate({ headline: "Cubs beat Reds", publishedAt: hoursLater(11), discoveredAt: hoursLater(11) }),
      [neighbor({ headline: "Cubs beat Reds late", similarity: 0.9, freshAt: hoursLater(10), clusterFirstFreshAt: hoursLater(-14), clusterLastFreshAt: hoursLater(10) })],
      features,
    );
    expect(d.action).toBe("create");
  });

  it("blocks a join when the cluster's own event type conflicts", () => {
    const d = decide(candidate({ headline: "Owls trade guard to Herons" }), [neighbor({ headline: "Owls trade guard to Herons today", similarity: 0.9, clusterEventType: "game-result" })], features);
    expect(d.action).toBe("create");
  });

  it("flags a second HIGH cluster as a merge suggestion when it joins the best one", () => {
    const d = decide(
      candidate({ headline: "Pavin Smith's walk-off homer lifts D-backs over Yankees" }),
      [
        neighbor({ candidateId: "c1", clusterId: "cluster-a", headline: "Pavin Smith's pinch-hit, walk-off homer lifts D-backs over Yankees", similarity: 0.9 }),
        neighbor({ candidateId: "c2", clusterId: "cluster-b", headline: "Pavin Smith's game-winning homer lifts D-backs over Yankees", similarity: 0.78 }),
      ],
      features,
    );
    expect(d.clusterId).toBe("cluster-a");
    expect(d.ambiguous).toEqual([expect.objectContaining({ clusterId: "cluster-b", reason: "competing-high-confidence-cluster" })]);
  });

  it("is deterministic regardless of neighbour order", () => {
    const c = candidate({ headline: "Pavin Smith's walk-off homer lifts D-backs over Yankees" });
    const ns = [
      neighbor({ candidateId: "c1", clusterId: "cluster-b", headline: "Pavin Smith's game-winning homer lifts D-backs over Yankees", similarity: 0.8 }),
      neighbor({ candidateId: "c2", clusterId: "cluster-a", headline: "Pavin Smith's pinch-hit, walk-off homer lifts D-backs over Yankees", similarity: 0.8 }),
    ];
    expect(decide(c, ns, features).clusterId).toBe(decide(c, [...ns].reverse(), features).clusterId);
  });
});
