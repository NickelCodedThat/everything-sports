import { describe, expect, it } from "vitest";
import { BREADTH, EVENT_IMPORTANCE, SPORT_BASE } from "@/lib/news/editorial-ranking/config";
import { breadthPoints, corroboratedImportance, eventImportancePoints, hasStakes, inferTier, recencyPoints, velocityPoints } from "@/lib/news/editorial-ranking/signals";
import { cluster, member, members, minutesAgo, NOW } from "./editorial-helpers";

// Every headline and team is invented for the scenario it covers.

describe("sport priors", () => {
  it("keep the hard hierarchy basketball > football > baseball > everything else", () => {
    expect(SPORT_BASE.basketball).toBeGreaterThan(SPORT_BASE.football);
    expect(SPORT_BASE.football).toBeGreaterThan(SPORT_BASE.baseball);
    for (const other of ["boxing", "mma", "soccer", "hockey", "tennis", "golf", "motorsports", "olympics", "other", "unknown"]) {
      expect(SPORT_BASE.baseball).toBeGreaterThan(SPORT_BASE[other]);
    }
  });
});

describe("recency decay", () => {
  it("is smooth and monotonic — no hard cliff", () => {
    let previous = Infinity;
    for (let h = 0; h <= 48; h += 1) {
      const points = recencyPoints(h, h);
      expect(points).toBeLessThanOrEqual(previous);
      if (h > 0) expect(previous - points).toBeLessThan(10); // no cliff between adjacent hours
      previous = points;
    }
  });
  it("puts a 2-hour-old event well above the same routine event 18 hours later", () => {
    expect(recencyPoints(2, 2)).toBeGreaterThan(recencyPoints(18, 18) + 25);
  });
  it("a fresh re-report of an old event does not make it fresh", () => {
    expect(recencyPoints(0.5, 12)).toBeLessThan(recencyPoints(0.5, 0.5));
  });
});

describe("source breadth uses distinct publisher domains, capped", () => {
  it("counts domains, not candidate rows or repeat sightings from one domain", () => {
    const one = breadthPoints([member({ domain: "a.example" }), member({ domain: "a.example" }), member({ domain: "a.example" })], 1);
    expect(one.domains).toBe(1);
    expect(one.points).toBe(0);
  });
  it("50 verbatim syndicated copies cannot beat a few genuinely independent sources on breadth by much", () => {
    const syndicated = breadthPoints(members(50, { headline: "Same wire headline" }), 1);
    const independent = breadthPoints(members(4, { headline: "Own reporting" }, true), 1);
    expect(syndicated.points).toBeLessThanOrEqual(BREADTH.domainsMax + BREADTH.variantsMax + BREADTH.knownConfirmation.threePlus + BREADTH.providerMax);
    expect(syndicated.domains).toBe(50);
    expect(syndicated.variants).toBe(1);
    expect(independent.variants).toBe(4);
  });
  it("saturates: 20 and 200 domains are worth the same", () => {
    expect(breadthPoints(members(20), 1).points).toBe(breadthPoints(members(200), 1).points);
  });
  it("ignores disabled sources and rewards multiple known publishers without calling it credibility", () => {
    const withDisabled = breadthPoints([...members(2), member({ domain: "off.example", sourceEnabled: false })], 1);
    expect(withDisabled.domains).toBe(2);
    const known = breadthPoints(members(3, { quality: "known" }), 1);
    expect(known.parts.map((p) => p.key)).toContain("breadth.confirmation");
    expect(known.parts.find((p) => p.key === "breadth.confirmation")!.detail).toMatch(/not a credibility rating/);
  });
  it("discounts routine coverage (game results) but not real news", () => {
    const ms = members(12);
    expect(breadthPoints(ms, 1, "game-result").points).toBeLessThan(breadthPoints(ms, 1, "injury").points);
  });
  it("provider count is only a minor supporting signal", () => {
    const a = breadthPoints(members(3), 1).points;
    const b = breadthPoints(members(3), 3).points;
    expect(b - a).toBeLessThanOrEqual(BREADTH.providerMax);
  });
});

describe("coverage velocity", () => {
  it("counts DISTINCT domains that first reported in the last 15 minutes and the rest of the hour", () => {
    const ms = [
      member({ domain: "a.example", reportedAt: minutesAgo(5) }),
      member({ domain: "a.example", reportedAt: minutesAgo(3) }), // same domain again: not a new source
      member({ domain: "b.example", reportedAt: minutesAgo(10) }),
      member({ domain: "c.example", reportedAt: minutesAgo(40) }),
      member({ domain: "d.example", reportedAt: minutesAgo(300) }),
    ];
    const v = velocityPoints(ms, NOW);
    expect(v.last15m).toBe(2);
    expect(v.lastHour).toBe(3);
    expect(v.points).toBe(2 * 5 + 1 * 2);
  });
  it("a single source has no velocity, and old clusters have none", () => {
    expect(velocityPoints([member({ domain: "a.example", reportedAt: minutesAgo(2) })], NOW).points).toBe(0);
    expect(velocityPoints(members(6, { reportedAt: minutesAgo(600) }), NOW).points).toBe(0);
  });
  it("is capped, and discounted for routine syndication", () => {
    const burst = members(20, { reportedAt: minutesAgo(1) });
    expect(velocityPoints(burst, NOW).points).toBe(4 * 5);
    expect(velocityPoints(burst, NOW, "game-result").points).toBeLessThan(velocityPoints(burst, NOW, "injury").points);
  });
});

describe("event importance", () => {
  it("ranks major news types above routine results, and previews below zero", () => {
    expect(eventImportancePoints("trade")).toBeGreaterThan(eventImportancePoints("game-result"));
    expect(eventImportancePoints("death")).toBeGreaterThan(eventImportancePoints("injury"));
    expect(EVENT_IMPORTANCE.preview).toBeLessThan(0);
    expect(eventImportancePoints(null)).toBe(eventImportancePoints("other"));
  });
  it("an event type only earns full importance once corroborated", () => {
    expect(corroboratedImportance(40, 1).points).toBe(20);
    expect(corroboratedImportance(40, 2).points).toBe(32);
    expect(corroboratedImportance(40, 3).points).toBe(40);
    expect(corroboratedImportance(-15, 1).points).toBe(-15);
  });
  it("detects high-stakes LANGUAGE only — never invents game stage from nothing", () => {
    expect(hasStakes(["Owls clinch the NBA Finals in Game 7"])).toBe(true);
    expect(hasStakes(["Van outlasts Pantoja to retain flyweight title"])).toBe(true);
    expect(hasStakes(["Cubs beat Reds to keep slim playoff hopes alive"])).toBe(false);
    expect(hasStakes(["Herons top Owls 5-2"])).toBe(false);
  });
});

describe("competition tier", () => {
  const tier = (entities: string[], sport = "football", headlines: string[] = [], league: string | null = null) => inferTier(cluster({ entities, sport, league }), headlines);
  it("recognizes pro leagues and pro teams", () => {
    expect(tier(["league:nfl", "team:ravens"])).toBe("professional");
    expect(tier(["team:cubs", "team:reds"], "baseball")).toBe("professional");
  });
  it("recognizes college by league, program names or vocabulary — and never calls a pro nickname college", () => {
    expect(tier(["league:fbs"])).toBe("college");
    expect(tier(["team:lsu", "team:ole miss"])).toBe("college");
    expect(tier([], "football", ["No. 8 Ole Miss beats LSU in college football"])).toBe("college");
    expect(tier(["team:giants"])).toBe("professional");
  });
  it("does not guess: no evidence in a big-three sport is a middle value, other sports default to the pro tour", () => {
    expect(tier([], "basketball")).toBe("unspecified-major");
    expect(tier([], "mma")).toBe("professional");
    expect(tier([], "olympics")).toBe("international");
  });
  it("prefers an explicit league when the warehouse recorded one", () => {
    expect(tier([], "basketball", [], "NCAAB")).toBe("college");
  });
});
