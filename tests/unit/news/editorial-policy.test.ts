import { describe, expect, it } from "vitest";
import { assessEligibility } from "@/lib/news/editorial-ranking/eligibility";
import {
  classifyUrgency,
  type UrgencyInput,
} from "@/lib/news/editorial-ranking/urgency";
import {
  scoreCluster,
  rankClusters,
  compareRanked,
  priorityForScore,
} from "@/lib/news/editorial-ranking/score";
import { deskForSport } from "@/lib/news/editorial-ranking/sections";
import type {
  ClusterInput,
  OverrideInput,
} from "@/lib/news/editorial-ranking/types";
import { cluster, NOW } from "./editorial-helpers";

const override = (
  kind: OverrideInput["kind"],
  amount: number | null = null,
  text: string | null = null,
): OverrideInput => ({
  id: 1,
  kind,
  amount,
  text,
  reason: "editor decision",
  createdAt: NOW,
});
const score = (c = cluster(), overrides: OverrideInput[] = []) =>
  scoreCluster(c, { now: NOW, overrides });

describe("eligibility safety before priority", () => {
  it.each<[Partial<ClusterInput>, string]>([
    [{ status: "closed" }, "closed-cluster"],
    [{ status: "needs_review" }, "needs-review-state"],
    [{ confidence: "low" }, "low-confidence"],
    [{ canonicalHeadline: null }, "no-publisher-headline"],
    [{ canonicalHeadline: " " }, "no-publisher-headline"],
    [{ representativeCandidateId: "missing" }, "no-publisher-headline"],
    [{ members: [] }, "no-publisher-headline"],
  ])("holds unsafe input %j", (change, code) => {
    const item = score(cluster(change), [
      override("pin"),
      override("force_priority", 999),
    ]);
    expect(item.eligibility.state).toBe("ineligible");
    expect(item.eligibility.reasons.map((r) => r.code)).toContain(code);
    expect(item.sectionEligibility).toMatchObject({
      lead: false,
      wire: false,
      now: false,
      desk: false,
    });
  });
  it.each([
    "all-sources-low-quality",
    "all-sources-disabled",
    "discovery-text-only",
  ])("holds %s", (code) => {
    const c = cluster();
    c.members.forEach((m) => {
      if (code === "all-sources-disabled") m.sourceEnabled = false;
      else if (code === "discovery-text-only")
        m.headlineKind = "discovery-text";
      else m.quality = "low-quality";
    });
    expect(assessEligibility(c, NOW).reasons.map((r) => r.code)).toContain(
      code,
    );
    expect(score(c, [override("boost", 300)]).sectionEligibility.lead).toBe(
      false,
    );
  });
  it("allows mixed operational quality", () => {
    const c = cluster();
    c.members[0].quality = "low-quality";
    expect(assessEligibility(c, NOW).state).toBe("eligible");
  });
  it("requires review for medium confidence or unresolved ambiguity", () => {
    for (const c of [
      cluster({ confidence: "medium" }),
      cluster({
        nearMisses: [
          { reason: "competing-high-confidence-cluster", confidence: "high" },
        ],
      }),
    ]) {
      expect(score(c).eligibility.state).toBe("review");
      expect(score(c).sectionEligibility.lead).toBe(false);
    }
  });
  it("holds stale reports past 48 hours", () => {
    expect(score(cluster({ ageHours: 49 })).eligibility.state).toBe(
      "ineligible",
    );
    expect(score(cluster({ ageHours: 48 })).eligibility.state).toBe("eligible");
  });
  it.each(["held", "rejected"] as const)(
    "preserves safe headline but excludes editor %s",
    (itemStatus) => {
      const c = cluster();
      const r = scoreCluster(c, {
        now: NOW,
        itemStatus,
        overrides: [override("pin")],
      });
      expect(r.headline).toBe(c.canonicalHeadline);
      expect(r.eligibility.state).toBe("ineligible");
    },
  );
  it("priority cannot bypass betting restrictions", () => {
    const r = score(
      cluster({ canonicalHeadline: "Sportsbook bonus code and free bets" }),
      [override("pin")],
    );
    expect(r.eligibility.reasons.map((r) => r.code)).toContain(
      "betting-or-fantasy",
    );
  });
  it("cannot invent a headline different from the representative", () => {
    const c = cluster();
    c.canonicalHeadline = "An invented replacement";
    expect(score(c).headline).toBeNull();
    expect(score(c).eligibility.state).toBe("ineligible");
  });
});

describe("urgency restraint", () => {
  const base: UrgencyInput = {
    eventType: "trade",
    latestAgeHours: 0.5,
    domains: 3,
    sourcesLastHour: 3,
    confidence: "high",
    headlines: ["Herons trade star guard to Owls"],
  };
  it.each<[Partial<UrgencyInput>, string]>([
    [{}, "breaking-candidate"],
    [{ domains: 1 }, "normal"],
    [{ sourcesLastHour: 1 }, "developing"],
    [{ confidence: "medium" }, "developing"],
    [{ confidence: "low" }, "normal"],
    [{ latestAgeHours: 3 }, "developing"],
    [{ latestAgeHours: 7 }, "normal"],
    [{ eventType: "preview" }, "normal"],
    [{ eventType: "game-result" }, "normal"],
    [{ eventType: "other" }, "normal"],
    [{ eventType: null }, "normal"],
    [{ eventType: "record" }, "developing"],
    [{ headlines: ["Herons could trade guard"] }, "normal"],
    [{ headlines: ["Opinion: Herons trade analysis"] }, "normal"],
    [{ headlines: ["How to watch Herons tonight"] }, "normal"],
  ])("classifies %j as %s", (change, level) =>
    expect(classifyUrgency({ ...base, ...change }).level).toBe(level),
  );
});

describe("explainable score and overrides", () => {
  it.each([
    [],
    [override("pin")],
    [override("boost", 300)],
    [override("suppress")],
    [override("force_priority", 199.12)],
  ])("parts sum to final score", (...args) => {
    const r = score(cluster(), args as OverrideInput[]);
    expect(
      Number(r.scoreParts.reduce((s, p) => s + p.points, 0).toFixed(2)),
    ).toBe(r.finalScore);
    expect(new Set(r.scoreParts.map((p) => p.key)).size).toBe(
      r.scoreParts.length,
    );
  });
  it.each<[OverrideInput, number]>([
    [override("pin"), 1000],
    [override("boost", 500), 300],
    [override("suppress"), -80],
  ])("applies priority change %j", (o, delta) => {
    const c = cluster();
    expect(score(c, [o]).finalScore - score(c).finalScore).toBeCloseTo(delta);
    expect(score(c).finalScore).toBe(score(c, []).finalScore);
  });
  it("force priority replaces total", () =>
    expect(
      score(cluster(), [override("pin"), override("force_priority", 180)])
        .finalScore,
    ).toBe(180));
  it("medium confidence has a visible penalty", () =>
    expect(score(cluster({ confidence: "medium" })).scoreParts).toContainEqual(
      expect.objectContaining({ key: "confidence", points: -25 }),
    ));
  it("ranks deterministically and does not rank holds", () => {
    const a = cluster({ sport: "basketball" }),
      b = cluster({ sport: "football" }),
      c = cluster({ status: "closed" });
    const first = rankClusters([c, b, a], { now: NOW });
    expect(first.filter((r) => r.position).map((r) => r.clusterId)).toEqual([
      a.clusterId,
      b.clusterId,
    ]);
    expect(rankClusters([a, b, c], { now: NOW })).toEqual(first);
    expect(compareRanked(first[0], first[0])).toBe(0);
  });
  it("basketball wins an exact score tie", () => {
    const a = score(cluster({ sport: "basketball" }), [
      override("force_priority", 200),
    ]);
    const b = score(cluster({ sport: "football" }), [
      override("force_priority", 200),
    ]);
    expect(compareRanked(a, b)).toBeLessThan(0);
  });
  it.each([
    [210, 1],
    [170, 2],
    [130, 3],
    [129, 4],
  ])("priority %i → %i", (n, p) => expect(priorityForScore(n)).toBe(p));
});

describe("section assignment", () => {
  it.each([
    ["basketball", "run"],
    ["football", "huddle"],
    ["baseball", "diamond"],
    ["mma", "fight-desk"],
    ["boxing", "fight-desk"],
    ["soccer", "world-game"],
    ["tennis", "across-the-board"],
  ])("maps %s to %s", (sport, desk) => expect(deskForSport(sport)).toBe(desk));
  it("single source cannot lead even pinned", () =>
    expect(
      score(cluster({ domains: 1 }), [override("pin")]).sectionEligibility.lead,
    ).toBe(false));
  it("two sources can lead an important event", () =>
    expect(
      score(cluster({ domains: 2, eventType: "injury" })).sectionEligibility
        .lead,
    ).toBe(true));
  it("routine recaps require broad support to lead and never become Wire solely by syndication", () => {
    expect(
      score(cluster({ eventType: "game-result", domains: 5 }))
        .sectionEligibility,
    ).toMatchObject({ lead: false, wire: false, desk: true });
    expect(
      score(cluster({ eventType: "game-result", domains: 12 }))
        .sectionEligibility.lead,
    ).toBe(true);
  });
  it("previews cannot fill any section", () =>
    expect(
      score(cluster({ eventType: "preview" })).sectionEligibility,
    ).toMatchObject({ lead: false, wire: false, now: false, desk: false }));
  it("Now needs freshness but desks can carry older substantive news", () =>
    expect(score(cluster({ ageHours: 13 })).sectionEligibility).toMatchObject({
      lead: false,
      wire: false,
      now: false,
      desk: true,
    }));
  it("single-source commentary leaves desks quiet", () =>
    expect(
      score(cluster({ domains: 1, eventType: "other" })).sectionEligibility
        .desk,
    ).toBe(false));
  it("single-source substantive news can reach its desk", () =>
    expect(
      score(cluster({ domains: 1, eventType: "injury" })).sectionEligibility
        .desk,
    ).toBe(true));
  it("forced lead cannot bypass qualification", () =>
    expect(
      score(cluster({ domains: 1 }), [override("force_section", null, "lead")])
        .ignoredOverrides,
    ).toHaveLength(1));
});
