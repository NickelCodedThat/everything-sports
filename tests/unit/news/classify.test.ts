import { describe, expect, it } from "vitest";
import { classifyCandidate } from "@/lib/news/classification/classify";

describe("classifyCandidate", () => {
  it("gives high confidence when the headline matches its own query profile terms", () => {
    const result = classifyCandidate({
      headline: "Lakers agree to trade for All-Star forward, NBA sources say",
      queryProfileSport: "basketball",
    });
    expect(result.sport).toBe("basketball");
    expect(result.confidence).toBe("high");
    expect(result.signals.join(" ")).toMatch(/NBA/);
  });

  it("gives lower confidence when nothing in the headline confirms the query profile", () => {
    const result = classifyCandidate({
      headline: "Team wins big game on the road",
      queryProfileSport: "basketball",
    });
    expect(result.sport).toBe("basketball");
    expect(result.confidence).not.toBe("high");
  });

  it("never uses bare 'football' as a signal, and reclassifies a soccer headline pulled in under a football query profile", () => {
    const result = classifyCandidate({
      headline: "Manchester United close in on Champions League spot with Premier League win",
      queryProfileSport: "football",
    });
    expect(result.sport).toBe("soccer");
    expect(result.confidence).toBe("medium");
    expect(result.signals.some((signal) => signal.includes("soccer"))).toBe(true);
  });

  it("keeps the query profile sport when it matches strongly, even if another profile also matches weakly", () => {
    const result = classifyCandidate({
      headline: "NFL commissioner addresses college football playoff expansion",
      queryProfileSport: "football",
    });
    expect(result.sport).toBe("football");
    expect(result.confidence).toBe("high");
  });

  it("treats a sports provider category as a confirming signal", () => {
    const result = classifyCandidate({
      headline: "Local team advances to next round",
      queryProfileSport: "hockey",
      providerCategories: ["sports"],
    });
    expect(result.signals.some((signal) => signal.includes("provider category confirms"))).toBe(true);
  });

  it("treats a non-sports provider category as a contradicting signal that lowers confidence", () => {
    const result = classifyCandidate({
      headline: "Team owner comments on quarterly earnings",
      queryProfileSport: "basketball",
      providerCategories: ["business", "politics"],
    });
    expect(result.confidence).toBe("low");
    expect(result.signals.some((signal) => signal.includes("do not indicate sports"))).toBe(true);
  });

  it("always returns inspectable signals, never an opaque score alone", () => {
    const result = classifyCandidate({ headline: "Some headline", queryProfileSport: "golf" });
    expect(result.signals.length).toBeGreaterThan(0);
  });
});
