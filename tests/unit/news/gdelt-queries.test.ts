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
