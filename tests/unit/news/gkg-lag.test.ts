import { describe, expect, it } from "vitest";
import {
  computeGkgLag,
  formatGkgStamp,
  latestExpectedStamp,
  newestBoundaryStamp,
  parseGkgStamp,
  stampDistance,
  stampFromUnitKey,
} from "@/lib/news/engine/gkg-lag";

const at = (iso: string) => new Date(iso);

describe("GKG stamp parsing", () => {
  it("round-trips valid stamps", () => {
    const stamp = "20260920014500";
    expect(formatGkgStamp(parseGkgStamp(stamp)!)).toBe(stamp);
  });

  it.each(["", "2026092001450", "202609200145000", "20261320014500", "20260230014500", "20260920246000", "abcdefghijklmn"])(
    "rejects %s",
    (stamp) => expect(parseGkgStamp(stamp)).toBeNull(),
  );

  it("accepts a leap day and rejects the same date in a non-leap year", () => {
    expect(parseGkgStamp("20280229120000")).not.toBeNull();
    expect(parseGkgStamp("20270229120000")).toBeNull();
  });

  it("extracts the stamp from a unit key", () => {
    expect(stampFromUnitKey("gdelt-gkg:20260920014500")).toBe("20260920014500");
    expect(stampFromUnitKey("gdelt-gkg:replay-123")).toBeNull();
    expect(stampFromUnitKey(null)).toBeNull();
  });
});

describe("latest expected file (publication grace)", () => {
  it("does not expect the current quarter-hour file until the grace has elapsed", () => {
    // 04:47 UTC — the 04:45 file is only 2 minutes old: not expected yet, 04:30 is.
    expect(newestBoundaryStamp(at("2026-09-20T04:47:00Z"))).toBe("20260920044500");
    expect(latestExpectedStamp(at("2026-09-20T04:47:00Z"), 10)).toBe("20260920043000");
    // 04:55 — grace elapsed, 04:45 is now expected.
    expect(latestExpectedStamp(at("2026-09-20T04:55:00Z"), 10)).toBe("20260920044500");
  });

  it("is exactly on the boundary at boundary + grace (inclusive)", () => {
    expect(latestExpectedStamp(at("2026-09-20T04:54:59Z"), 10)).toBe("20260920043000");
    expect(latestExpectedStamp(at("2026-09-20T04:55:00Z"), 10)).toBe("20260920044500");
  });

  it("handles hour changes", () => {
    expect(latestExpectedStamp(at("2026-09-20T05:05:00Z"), 10)).toBe("20260920044500");
    expect(latestExpectedStamp(at("2026-09-20T05:09:59Z"), 10)).toBe("20260920044500");
    expect(latestExpectedStamp(at("2026-09-20T05:10:00Z"), 10)).toBe("20260920050000");
  });

  it("handles midnight UTC: shortly after 00:00 the expected file is the previous day's 23:45", () => {
    expect(latestExpectedStamp(at("2026-09-21T00:05:00Z"), 10)).toBe("20260920234500");
    expect(latestExpectedStamp(at("2026-09-21T00:10:00Z"), 10)).toBe("20260921000000");
    expect(newestBoundaryStamp(at("2026-09-21T00:00:01Z"))).toBe("20260921000000");
  });

  it("handles month, year and leap-day rollovers", () => {
    expect(latestExpectedStamp(at("2026-10-01T00:03:00Z"), 10)).toBe("20260930234500");
    expect(latestExpectedStamp(at("2027-01-01T00:00:00Z"), 10)).toBe("20261231234500");
    expect(latestExpectedStamp(at("2028-03-01T00:04:00Z"), 10)).toBe("20280229234500");
  });

  it("respects a custom grace and a zero grace", () => {
    expect(latestExpectedStamp(at("2026-09-20T04:47:00Z"), 0)).toBe("20260920044500");
    expect(latestExpectedStamp(at("2026-09-20T04:47:00Z"), 20)).toBe("20260920041500"); // 04:27 → 04:15
  });
});

describe("stampDistance", () => {
  it("counts 15-minute steps, across midnight", () => {
    expect(stampDistance("20260920043000", "20260920044500")).toBe(1);
    expect(stampDistance("20260920234500", "20260921000000")).toBe(1);
    expect(stampDistance("20260920000000", "20260921000000")).toBe(96);
    expect(stampDistance("20260920044500", "20260920043000")).toBe(-1);
    expect(stampDistance("bad", "20260920043000")).toBeNull();
  });
});

describe("computeGkgLag", () => {
  const now = at("2026-09-20T05:05:00Z"); // expected = 04:45, newest boundary = 05:00 (not due yet)

  it("reports 'current' and never an outage while the newest file is inside its publication grace", () => {
    const lag = computeGkgLag({ now, latestAvailableStamp: "20260920044500", latestProcessedStamp: "20260920044500" });
    expect(lag).toMatchObject({ expectedStamp: "20260920044500", newestBoundaryStamp: "20260920050000", newestBoundaryDue: false, processedLagFiles: 0, cause: "none" });
  });

  it("treats having processed a file newer than 'expected' as zero lag (never negative)", () => {
    const lag = computeGkgLag({ now, latestAvailableStamp: "20260920050000", latestProcessedStamp: "20260920050000" });
    expect(lag.processedLagFiles).toBe(0);
    expect(lag.upstreamLagFiles).toBe(0);
  });

  it("counts files behind and blames ingestion when upstream has the files", () => {
    const lag = computeGkgLag({ now, latestAvailableStamp: "20260920044500", latestProcessedStamp: "20260920041500" });
    expect(lag).toMatchObject({ processedLagFiles: 2, upstreamLagFiles: 0, unprocessedAvailableFiles: 2, cause: "ingest-behind" });
  });

  it("blames GDELT when the newest available file is itself late", () => {
    const lag = computeGkgLag({ now, latestAvailableStamp: "20260920040000", latestProcessedStamp: "20260920040000" });
    expect(lag).toMatchObject({ processedLagFiles: 3, upstreamLagFiles: 3, unprocessedAvailableFiles: 0, cause: "upstream-late" });
  });

  it("handles a lag that spans midnight UTC", () => {
    const lag = computeGkgLag({ now: at("2026-09-21T00:25:00Z"), latestAvailableStamp: "20260921001500", latestProcessedStamp: "20260920233000" });
    expect(lag.expectedStamp).toBe("20260921001500");
    expect(lag.processedLagFiles).toBe(3);
  });

  it("returns no-data when nothing has been processed yet", () => {
    const lag = computeGkgLag({ now, latestAvailableStamp: null, latestProcessedStamp: null });
    expect(lag).toMatchObject({ processedLagFiles: null, upstreamLagFiles: null, cause: "no-data" });
  });

  it("flags newestBoundaryDue once the grace has elapsed", () => {
    expect(computeGkgLag({ now: at("2026-09-20T05:11:00Z"), latestProcessedStamp: "20260920050000" }).newestBoundaryDue).toBe(true);
  });
});
