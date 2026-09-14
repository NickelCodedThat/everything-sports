import { describe, expect, it } from "vitest";
import { InvalidCliArgError, parseProbeArgs } from "@/lib/news/cli/parse-args";

describe("parseProbeArgs", () => {
  it("uses conservative defaults when no flags are given", () => {
    const options = parseProbeArgs([]);
    expect(options).toEqual({ provider: "all", sport: "all", window: "3h", limit: 25, json: false });
  });

  it("parses the documented example invocation", () => {
    const options = parseProbeArgs(["--provider=gdelt", "--sport=basketball", "--window=3h", "--limit=20"]);
    expect(options).toEqual({ provider: "gdelt", sport: "basketball", window: "3h", limit: 20, json: false });
  });

  it("parses --provider=all", () => {
    expect(parseProbeArgs(["--provider=all"]).provider).toBe("all");
  });

  it("parses the --json flag", () => {
    expect(parseProbeArgs(["--json"]).json).toBe(true);
  });

  it("accepts every queryable sport", () => {
    for (const sport of ["basketball", "football", "baseball", "boxing", "mma", "soccer", "hockey", "tennis", "golf", "motorsports", "olympics"]) {
      expect(parseProbeArgs([`--sport=${sport}`]).sport).toBe(sport);
    }
  });

  it("rejects an unknown provider", () => {
    expect(() => parseProbeArgs(["--provider=espn"])).toThrow(InvalidCliArgError);
  });

  it("rejects an unknown sport", () => {
    expect(() => parseProbeArgs(["--sport=cricket"])).toThrow(InvalidCliArgError);
  });

  it("rejects a non-numeric --limit", () => {
    expect(() => parseProbeArgs(["--limit=abc"])).toThrow(InvalidCliArgError);
  });

  it("rejects a zero or negative --limit", () => {
    expect(() => parseProbeArgs(["--limit=0"])).toThrow(InvalidCliArgError);
    expect(() => parseProbeArgs(["--limit=-5"])).toThrow(InvalidCliArgError);
  });

  it("rejects an unrecognized flag", () => {
    expect(() => parseProbeArgs(["--bogus=1"])).toThrow(InvalidCliArgError);
  });

  it("rejects a malformed argument with no '=' separator", () => {
    expect(() => parseProbeArgs(["--provider"])).toThrow(InvalidCliArgError);
  });
});
