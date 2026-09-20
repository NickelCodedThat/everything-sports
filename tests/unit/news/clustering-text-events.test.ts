import { describe, expect, it } from "vitest";
import { classifyEvent, compareEventTypes } from "@/lib/news/clustering/event-type";
import { contentTokens, extractAmounts, extractScores, jaccard, stripSourceSuffix } from "@/lib/news/clustering/text";
import { extractFeatures } from "@/lib/news/clustering/features";
import { fuzzyWindowHours, WINDOWS_HOURS } from "@/lib/news/clustering/config";
import { parseClusterArgs } from "@/lib/news/clustering/cli";
import { parseWindowMs } from "@/lib/news/clustering/run";

// Every headline below is invented for the scenario it covers.

describe("headline text helpers", () => {
  it("strips publisher-branding suffixes but not real dashes in titles", () => {
    expect(stripSourceSuffix("Owls edge Herons in extra innings – Lakeview Ledger")).toBe("Owls edge Herons in extra innings");
    expect(stripSourceSuffix("Owls edge Herons in extra innings | 95.7 FM")).toBe("Owls edge Herons in extra innings");
    expect(stripSourceSuffix("Owls-Herons: a rivalry renewed")).toBe("Owls-Herons: a rivalry renewed");
  });

  it("tokenizes content words: no stopwords, possessives or diacritics; spelled-out numbers normalized", () => {
    expect(contentTokens("Martínez's six-start streak ends")).toEqual(["martinez", "6", "start", "streak", "ends"]);
  });

  it("computes jaccard on token sets", () => {
    expect(jaccard(["a", "b", "c"], ["b", "c", "d"])).toBeCloseTo(0.5);
    expect(jaccard([], [])).toBe(0);
  });

  it("extracts final scores as unordered keys and ignores dates, times and years", () => {
    expect(extractScores("Owls beat Herons 6-3")).toEqual(["3-6"]);
    expect(extractScores("Herons lose 3–6 to Owls")).toEqual(["3-6"]);
    expect(extractScores("Owls 6, Herons 5: a thriller")).toEqual(["5-6"]);
    expect(extractScores("Kickoff 2026-09-20 at 5:40 CT, Sept. 20, 2-run homer")).toEqual([]);
  });

  it("normalizes dollar amounts", () => {
    expect(extractAmounts("Guard fined $15,000 by the league")).toEqual(["$15000"]);
    expect(extractAmounts("Deal worth $15K and $2.5 million")).toEqual(["$15000", "$2500000"]);
  });
});

describe("event typing", () => {
  const type = (headline: string) => classifyEvent(headline, extractScores(headline).length > 0).type;

  it.each([
    ["Owls edge Herons in extra innings", "game-result"],
    ["Herons' Ruiz homers twice, Owls dominate Pines", "game-result"],
    ["Owls 6, Herons 5: a thriller", "game-result"],
    ["Sanchez leads Owls to a win over the Herons", "game-result"],
    ["Herons rule out star guard Ruiz (hamstring) vs. Owls", "injury"],
    ["Owls trade veteran center to the Herons", "trade"],
    ["Herons sign guard Ruiz to a multi-year contract", "signing"],
    ["Owls fire head coach after fifth straight loss", "coaching"],
    ["League suspends Herons forward two games", "discipline"],
    ["Ruiz breaks Herons franchise record for assists", "record"],
    ["Herons legend Ruiz dies at 71", "death"],
    ["Ruiz announces retirement after 14 seasons", "retirement"],
    ["How to watch Owls vs. Herons: TV channel and live stream", "preview"],
    ["Owls-Herons predictions: keys to victory", "preview"],
    ["Owls elevate two players from the practice squad", "transaction"],
    ["Another way the Cubs may defeat the Reds", "preview"],
    ["Don't overthink it: Cubs will steamroll nascent Reds", "preview"],
  ])("%s → %s", (headline, expected) => {
    expect(type(headline)).toBe(expected);
  });

  it('does not read the noun "top" (as in "top player") as a result verb', () => {
    expect(type("Cubs will be without top player against the Reds")).toBeNull();
  });

  it("returns null (never a forced guess) when the evidence is unclear", () => {
    expect(type("Thoughts on the weekend")).toBeNull();
    expect(type("Owls Insider newsletter")).toBeNull();
  });

  it("does not let a weak mention of injuries turn a preview into an injury story", () => {
    const c = classifyEvent("Owls-Herons predictions: how will Ruiz adjust to injuries?", false);
    expect(c.type).toBe("preview");
  });

  it("agrees on identical, compatible and unknown types and flags conflicts", () => {
    const e = (h: string) => classifyEvent(h, extractScores(h).length > 0);
    expect(compareEventTypes(e("Owls beat Herons"), e("Herons fall to Owls in loss"))).toBe("same");
    expect(compareEventTypes(e("Owls trade guard to Herons"), e("Owls sign guard from Herons"))).toBe("compatible");
    expect(compareEventTypes(e("Ruiz breaks franchise record as Owls beat Herons"), e("Owls beat Herons"))).toBe("compatible");
    expect(compareEventTypes(e("Owls beat Herons"), e("Thoughts on the weekend"))).toBe("unknown");
    expect(compareEventTypes(e("Owls beat Herons"), e("How to watch Owls vs. Herons"))).toBe("conflict");
    expect(compareEventTypes(e("Owls trade guard to Herons"), e("Owls beat Herons"))).toBe("conflict");
  });
});

describe("time windows", () => {
  it("uses the tightest window when the event type is unclear or fast-moving", () => {
    expect(fuzzyWindowHours("game-result", "game-result")).toBe(WINDOWS_HOURS["game-result"]);
    expect(fuzzyWindowHours("injury", "injury")).toBe(WINDOWS_HOURS.default);
    expect(fuzzyWindowHours("injury", null)).toBe(WINDOWS_HOURS.unknown);
    expect(fuzzyWindowHours("trade", "game-result")).toBe(WINDOWS_HOURS["game-result"]);
  });
});

describe("headline features", () => {
  it("bundles teams, scores, event and entity keys", () => {
    const f = extractFeatures("Brandon Lowe's go-ahead homer lifts the Pirates past the Royals, 6-5");
    expect(f.teams).toEqual(["pirates", "royals"]);
    expect(f.scores).toEqual(["5-6"]);
    expect(f.event.type).toBe("game-result");
    expect(f.names.surnames).toContain("lowe");
  });

  it("matches team nicknames case-sensitively so common words are not teams", () => {
    expect(extractFeatures("Congress debates new bills about rays of sunshine").teams).toEqual([]);
  });

  it("collapses aliases to one canonical team", () => {
    expect(extractFeatures("D-backs edge Yankees").teams).toEqual(extractFeatures("Diamondbacks edge Yankees").teams);
    expect(extractFeatures("Sixers top Nets").teams).toContain("76ers");
  });

  it("re-cases ALL-CAPS headlines before matching", () => {
    expect(extractFeatures("RAYS WALK OFF RED SOX").teams).toEqual(["rays", "red sox"]);
  });

  it("skips person-name evidence in Title Case headlines, where every word is capitalized", () => {
    expect(extractFeatures("Rays Walk Off Red Sox In Extra Innings Against Rival Boston").names.fullNames).toEqual([]);
  });
});

describe("cluster CLI arguments", () => {
  it("defaults to a safe 24h window", () => {
    expect(parseClusterArgs([])).toEqual({ window: "24h", dryRun: false, json: false });
  });
  it("parses flags", () => {
    expect(parseClusterArgs(["--window=72h", "--sport=basketball", "--dry-run", "--json", "--limit=50"])).toEqual({
      window: "72h", sport: "basketball", dryRun: true, json: true, limit: 50,
    });
  });
  it("rejects bad input", () => {
    expect(() => parseClusterArgs(["--window=soon"])).toThrow(/--window/);
    expect(() => parseClusterArgs(["--sport=curling"])).toThrow(/--sport/);
    expect(() => parseClusterArgs(["--limit=0"])).toThrow(/--limit/);
    expect(() => parseClusterArgs(["--bogus"])).toThrow(/Unknown argument/);
  });
  it("parses window strings", () => {
    expect(parseWindowMs("30min")).toBe(30 * 60_000);
    expect(parseWindowMs("2d")).toBe(48 * 3_600_000);
    expect(() => parseWindowMs("2x")).toThrow();
  });
});
