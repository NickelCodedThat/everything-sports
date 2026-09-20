import { describe, expect, it } from "vitest";
import { buildGdeltQuery } from "@/lib/news/providers/gdelt/queries";

describe("buildGdeltQuery", () => {
  it("ORs bare single-word terms together", () => {
    expect(buildGdeltQuery("hockey")).toBe("(NHL) sourcelang:english");
  });

  it("quotes multi-word terms as exact phrases", () => {
    const query = buildGdeltQuery("basketball");
    expect(query).toContain('"college basketball"');
    expect(query).toContain("NBA OR WNBA");
  });

  it("never queries bare, unqualified 'football' — only NFL and the qualified 'college football' phrase", () => {
    const query = buildGdeltQuery("football");
    // "football" only appears inside the quoted "college football" phrase, never bare.
    expect(query).not.toMatch(/(?<!")\bfootball\b(?!")/i);
    expect(query).toContain("NFL");
    expect(query).toContain('"college football"');
  });

  it("appends an English-language filter", () => {
    expect(buildGdeltQuery("basketball")).toMatch(/sourcelang:english$/);
  });

  it("returns null for a sport with no query profile", () => {
    expect(buildGdeltQuery("other")).toBeNull();
  });
});

describe("query profile guardrails (2026-09-20 live evidence)", () => {
  it("never queries with bare 'football' — a raw 'football' sample was ~48% school-athletics pages, not NFL/college news", async () => {
    const { SPORT_QUERY_PROFILES } = await import("@/lib/news/queries/sport-profiles");
    const terms = SPORT_QUERY_PROFILES.football?.terms.map((t) => t.toLowerCase()) ?? [];
    expect(terms).not.toContain("football");
    expect(terms).toEqual(expect.arrayContaining(["nfl", "college football"]));
  });

  it("keeps league-specific terms for basketball and baseball", async () => {
    const { SPORT_QUERY_PROFILES } = await import("@/lib/news/queries/sport-profiles");
    expect(SPORT_QUERY_PROFILES.basketball?.terms).toEqual(expect.arrayContaining(["NBA", "WNBA", "college basketball"]));
    expect(SPORT_QUERY_PROFILES.baseball?.terms).toEqual(expect.arrayContaining(["MLB", "Major League Baseball"]));
  });
});
