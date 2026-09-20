import { describe, expect, it } from "vitest";
import { assessSourceQuality } from "@/lib/news/sources/quality";

describe("assessSourceQuality", () => {
  it("recognizes major publishers and league sites, including subdomains", () => {
    expect(assessSourceQuality("espn.com")).toBe("known");
    expect(assessSourceQuality("sports.yahoo.com")).toBe("known");
    expect(assessSourceQuality("mlb.com")).toBe("known");
  });

  it("flags betting-affiliate domains as low-quality", () => {
    expect(assessSourceQuality("covers.com")).toBe("low-quality");
    expect(assessSourceQuality("www.prizepicks.com")).toBe("low-quality");
  });

  it("does not match lookalike domains by suffix alone", () => {
    expect(assessSourceQuality("notespn.com")).toBe("unknown");
    expect(assessSourceQuality("espn.com.evil.example")).toBe("unknown");
  });

  it("treats everything else as unknown — not bad", () => {
    expect(assessSourceQuality("ktop1490.com")).toBe("unknown");
  });
});
