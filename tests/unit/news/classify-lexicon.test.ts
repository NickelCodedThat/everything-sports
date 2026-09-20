import { describe, expect, it } from "vitest";
import { classifyCandidate } from "@/lib/news/classification/classify";

/** Regression coverage for classification weaknesses found in the 2026-09-20 live samples. */
describe("classifyCandidate — lexicon tuning from real data", () => {
  it("lifts MLB headlines that name teams and play-by-play language but never say 'MLB'", () => {
    const result = classifyCandidate({
      headline: "Fictional slugger's grand slam powers Braves past Astros in an AL West showdown",
      queryProfileSport: "baseball",
    });
    expect(result.sport).toBe("baseball");
    expect(result.confidence).toBe("medium");
    expect(result.signals.join(" ")).toMatch(/team\/vocabulary/);
  });

  it("gives WNBA-style headlines that only carry two weak hints medium confidence", () => {
    const result = classifyCandidate({ headline: "Dream 100-80 Sky (Sep 1, 2026) Game Recap", queryProfileSport: "basketball" });
    expect(result.confidence).toBe("medium");
  });

  it("gives college-football matchups with two program names medium confidence", () => {
    const result = classifyCandidate({
      headline: "No. 10 Alabama edges Florida State in a high-scoring opener",
      queryProfileSport: "football",
    });
    expect(result.confidence).toBe("medium");
  });

  it("leaves a lone weak hint or a bare query origin at low confidence", () => {
    expect(classifyCandidate({ headline: "A retired point man reveals how he kept his edge", queryProfileSport: "basketball" }).confidence).toBe("low");
    expect(classifyCandidate({ headline: "Giants fans line up early", queryProfileSport: "baseball" }).confidence).toBe("low");
  });

  it("never lets a weak hint move a candidate off the sport that discovered it", () => {
    // 'Giants' is a weak hint for both NFL and MLB — the baseball query origin must survive.
    const result = classifyCandidate({ headline: "Giants rally in ninth to top Dodgers", queryProfileSport: "baseball" });
    expect(result.sport).toBe("baseball");
  });

  it("does not read the Nigerian Bar Association's 'NBA' as basketball", () => {
    const result = classifyCandidate({
      headline: "NBA president in Niger calls for inquiry into a mine collapse",
      queryProfileSport: "basketball",
    });
    expect(result.confidence).not.toBe("high");
    expect(result.signals.join(" ")).not.toMatch(/league terms: NBA/);
  });

  it("does not read 'Special Olympics' as the Olympics", () => {
    const result = classifyCandidate({ headline: "Special Olympics regional truck pull raises money for local athletes" });
    expect(result.sport).toBe("unknown");
  });

  it("does not treat the SEC as the football conference in securities-regulator headlines", () => {
    const result = classifyCandidate({ headline: "SEC charges founder of crypto firm with fraud against investors" });
    expect(result.sport).toBe("unknown");
  });

  it("matches team nicknames case-sensitively so ordinary words don't read as NFL", () => {
    expect(classifyCandidate({ headline: "Congress debates new bills on rising energy bears" }).sport).toBe("unknown");
    expect(classifyCandidate({ headline: "Bills and Dolphins meet in Miami" }).sport).toBe("football");
  });

  it("matches 'WNBA' as its own token, not as an 'NBA' substring", () => {
    const result = classifyCandidate({ headline: "WNBA playoff picture: eight teams still alive", queryProfileSport: "basketball" });
    expect(result.signals.join(" ")).toMatch(/WNBA/);
    expect(result.signals.join(" ")).not.toMatch(/league terms: NBA,/);
  });

  it("flags contradictory-sport vocabulary and downgrades an otherwise-high result", () => {
    const result = classifyCandidate({
      headline: "NFL kicker moonlights as striker in charity match",
      queryProfileSport: "football",
    });
    expect(result.signals.some((s) => s.startsWith("contradictory signal"))).toBe(true);
    expect(result.confidence).toBe("medium");
  });

  describe("with no query origin (feed-style providers)", () => {
    it("classifies from league terms alone", () => {
      const result = classifyCandidate({ headline: "Veteran receiver fined by the NFL for a uniform violation" });
      expect(result.sport).toBe("football");
      expect(result.confidence).toBe("high");
    });

    it("needs two distinct team hits when no league term is present", () => {
      expect(classifyCandidate({ headline: "Cubs edge Reds with a late-inning rally" }).sport).toBe("baseball");
      expect(classifyCandidate({ headline: "Yankees let lead slip away" }).sport).toBe("unknown");
    });

    it("uses parent-event context (Wikipedia Current Events) for classification", () => {
      const result = classifyCandidate({
        headline: "Atlanta player becomes first to reach 500 rebounds in a single season.",
        context: "2026 WNBA season",
      });
      expect(result.sport).toBe("basketball");
    });

    it("returns unknown/none rather than guessing", () => {
      const result = classifyCandidate({ headline: "A triathlete wins the opening gold medal at a regional multi-sport games" });
      expect(result).toMatchObject({ sport: "unknown", confidence: "none" });
      expect(result.signals.length).toBeGreaterThan(0);
    });
  });
});
