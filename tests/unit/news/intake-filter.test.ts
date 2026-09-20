import { describe, expect, it } from "vitest";
import { applyIntakeFilter, getIntakeRejections } from "@/lib/news/filters/intake";
import { buildCandidate } from "@/lib/news/normalization/build-candidate";

function make(headline: string, url = "https://www.example-news.com/sports/2026/09/20/some-story", extra: Partial<Parameters<typeof buildCandidate>[0]> = {}) {
  const candidate = buildCandidate({ provider: "gdelt", headline, sourceUrl: url, queryProfileSport: "basketball", language: "English", ...extra });
  if (!candidate) throw new Error("fixture rejected by buildCandidate");
  return candidate;
}

/** Every rejected headline below is verbatim from a real 2026-09-20 sample. */
describe("intake filter — rejects", () => {
  it.each([
    "Herons vs Owls Prediction, Pick, League Odds for Saturday",
    "Top DFS Picks & Strategies for Sunday: Lineup Tips",
    "Touchdown Parlay Week 2: three fictional receivers to back",
    "Last minute best bets for Week 2: road favorites to cover",
    "Rookie of the Year odds: two newcomers favored",
    "Fantasy Football Injury Tracker for Week 2",
    "Sportsbook Promo Code: Claim Bonus Bets for Saturday's title fight",
  ])("betting/fantasy: %s", (headline) => {
    expect(getIntakeRejections(make(headline))).toContain("betting-or-fantasy");
  });

  it.each([
    "Harbor City Herons at Lakeview Owls Preview - 09/20/2026",
    "Harbor City Herons at Lakeview Owls Game Story, Scores/Highlights - 09/19/2026",
    "Harbor City Herons vs Lakeview Owls Nov 15, 2026 Game Summary",
    "Watch Example Sports Network - Stream Live Sports & Originals",
    "Harbor City Herons vs. Lakeview Owls - September 20, 2026",
  ])("template page: %s", (headline) => {
    expect(getIntakeRejections(make(headline))).toContain("template-page");
  });

  it.each([
    "Condensed Game: HCH@LVO - 9/19/26",
    "Field View: Nolan Placeholder's two-run home run",
    "HLs: Rookie guard in playoff form in Sparks win",
    "Highlights From a Ten-Assist Game",
  ])("video clip title: %s", (headline) => {
    expect(getIntakeRejections(make(headline))).toContain("video-page");
  });

  it("video URL path", () => {
    expect(getIntakeRejections(make("A rookie's two-run home run", "https://www.mlb.com/video/noah-miller-two-run-homer"))).toContain("video-page");
  });

  it("Spanish-language clips even when the provider claims English", () => {
    expect(getIntakeRejections(make("Resumen Herons @ Owls, Resultados/Jugadas destacadas - 19/09/2026"))).toContain("non-english");
  });

  it("explicit non-English language", () => {
    expect(getIntakeRejections(make("Real Madrid gana con un gol de último minuto", undefined, { language: "Spanish" }))).toContain("non-english");
  });

  it("historical stats pages", () => {
    expect(getIntakeRejections(make("Sam Placeholder 1966 Situational Stats"))).toContain("historical-stats-page");
  });

  it("malformed headlines", () => {
    expect(getIntakeRejections(make("Breaking"))).toContain("malformed-headline");
    expect(getIntakeRejections(make("https://example.com/some-page-title"))).toContain("malformed-headline");
    expect(getIntakeRejections(make("Lakers ��� trade"))).toContain("malformed-headline");
  });

  it("publisher homepages", () => {
    expect(getIntakeRejections(make("ESPN sports news and scores hub", "https://www.espn.com/"))).toContain("generic-page");
  });

  it("betting-affiliate domains", () => {
    const candidate = make("Sixers fall to Kings in overtime thriller", "https://www.covers.com/nba/game-recap-123");
    expect(candidate.sourceQuality).toBe("low-quality");
    expect(getIntakeRejections(candidate)).toContain("low-quality-source");
  });

  it("candidates whose provider categories contradict sports and that have no sport evidence", () => {
    const candidate = make("Team owner comments on quarterly earnings", undefined, { providerCategories: ["business"] });
    expect(getIntakeRejections(candidate)).toContain("not-sports");
  });
});

describe("intake filter — keeps legitimate headlines", () => {
  it.each([
    "Trade pitch reunites a veteran guard with a former Warriors teammate",
    "League announces discipline for a dozen players before Week 2",
    "Draft picks and trade rumors swirl around the Celtics",
    "Rays beat the odds to clinch the AL East",
    "Rookie forward becomes first WNBA player to reach a rebounding milestone in a season",
    "Way-too-early NBA predictions for the 2027 season",
    "Preview of the Cubs' September pitching plans",
  ])("%s", (headline) => {
    expect(getIntakeRejections(make(headline))).toEqual([]);
  });
});

describe("applyIntakeFilter", () => {
  it("returns accepted and rejected candidates with reasons — never silently drops", () => {
    const good = make("Lakers beat Celtics in overtime thriller");
    const bad = make("NFL Prop Picks & Week 2 Best Bets");
    const { accepted, rejected } = applyIntakeFilter([good, bad]);
    expect(accepted).toEqual([good]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].candidate).toBe(bad);
    expect(rejected[0].reasons).toContain("betting-or-fantasy");
  });
});
