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
    "Storm vs Valkyries Prediction, Pick, WNBA Odds for Saturday, September 19",
    "Top WNBA DFS Picks & Strategies for September 20: Lineup Tips",
    "NFL Touchdown Parlay Week 2: Justin Jefferson, Deebo Samuel, Trey McBride",
    "Last minute best bets for NFL Week 2: Patriots bounce back vs. Steelers",
    "2026 MLB Rookie Of The Year Odds: McGonigle, Stewart Favored",
    "2026 Fantasy Football Injury Tracker",
    "FanDuel Promo Code: Claim $350 Bonus Bets for UFC 331 Van vs. Pantoja on Saturday",
  ])("betting/fantasy: %s", (headline) => {
    expect(getIntakeRejections(make(headline))).toContain("betting-or-fantasy");
  });

  it.each([
    "Toronto Blue Jays at Texas Rangers Preview - 09/20/2026",
    "Athletics at Cleveland Guardians Game Story, Scores/Highlights - 09/19/2026",
    "Charlotte Hornets vs LA Clippers Nov 15, 2026 Game Summary",
    "Watch ESPN - Stream Live Sports & ESPN Originals",
    "Indiana Fever vs. Washington Mystics - September 20, 2026",
  ])("template page: %s", (headline) => {
    expect(getIntakeRejections(make(headline))).toContain("template-page");
  });

  it.each([
    "Condensed Game: PHI@NYM - 9/19/26",
    "Field View: Jose Siri's two-run home run",
    "HLs: Bueckers in playoff form in Wings win",
    "Highlights From Jordin Canada 10-Assist Game",
  ])("video clip title: %s", (headline) => {
    expect(getIntakeRejections(make(headline))).toContain("video-page");
  });

  it("video URL path", () => {
    expect(getIntakeRejections(make("Noah Miller's two-run home run", "https://www.mlb.com/video/noah-miller-two-run-homer"))).toContain("video-page");
  });

  it("Spanish-language clips even when the provider claims English", () => {
    expect(getIntakeRejections(make("Resumen Cachorros @ Rojos, Resultados/Jugadas destacadas - 19/09/2026"))).toContain("non-english");
  });

  it("explicit non-English language", () => {
    expect(getIntakeRejections(make("Real Madrid gana con un gol de último minuto", undefined, { language: "Spanish" }))).toContain("non-english");
  });

  it("historical stats pages", () => {
    expect(getIntakeRejections(make("Stan Hindman 1966 Situational Stats"))).toContain("historical-stats-page");
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
    "Warriors trade pitch reunites Stephen Curry with $90 million NBA star",
    "NFL announces punishment for 20 players before Week 2",
    "Draft picks and trade rumors swirl around the Celtics",
    "Rays beat the odds to clinch the AL East",
    "Angel Reese becomes first WNBA player to reach 500 rebounds in a season",
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
