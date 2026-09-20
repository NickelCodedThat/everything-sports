import { describe, expect, it } from "vitest";
import { InvalidCliArgError } from "@/lib/news/cli/parse-args";
import { parseIngestArgs } from "@/lib/news/cli/parse-ingest-args";
import { formatIngestReport, formatStatsReport } from "@/lib/news/warehouse/report";
import { emptyMetrics, type WarehouseStats } from "@/lib/news/warehouse/types";
import type { WarehouseRunReport } from "@/lib/news/warehouse/ingest";

describe("parseIngestArgs", () => {
  it("defaults to the validated keyless provider and a 2h window", () => {
    expect(parseIngestArgs([])).toEqual({ provider: "gdelt-gkg", window: "2h", limit: 25, json: false });
  });

  it("parses provider, window, limit and --json", () => {
    expect(parseIngestArgs(["--provider=wikipedia-events", "--window=3d", "--limit=10", "--json"])).toEqual({
      provider: "wikipedia-events", window: "3d", limit: 10, json: true,
    });
  });

  it.each([["--window=soon"], ["--limit=0"], ["--limit=abc"], ["--provider="], ["--bogus=1"], ["positional"]])("rejects %s", (arg) => {
    expect(() => parseIngestArgs([arg])).toThrow(InvalidCliArgError);
  });
});

describe("report formatting", () => {
  const report = {
    run: { id: "11111111-2222-3333-4444-555555555555", status: "succeeded", window_label: "2h" },
    providerState: "ok",
    totals: { ...emptyMetrics(), inserted: 81, duplicateHeadline: 45, sourcesCreated: 47, observationsCreated: 81, rejectionsRecorded: 1 },
    returned: 82, accepted: 81, rejected: 1, unitsProcessed: 8, unitsSkipped: 0, errors: [], durationMs: 5211,
  } as unknown as WarehouseRunReport;

  it("shows run id, provider, counts and duration — and no credential-looking text", () => {
    const text = formatIngestReport(report, "gdelt-gkg");
    for (const expected of ["11111111-2222-3333-4444-555555555555", "gdelt-gkg", "returned          82", "accepted          81", "inserted          81", "duplicate headline 45", "sources created   47", "5211ms"]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toMatch(/sb_secret|eyJ|SECRET/i);
  });

  it("formats stats, including the empty state", () => {
    const stats: WarehouseStats = {
      total_candidates: 81, distinct_headlines: 36, duplicate_headline_candidates: 45, duplicate_headline_rate: 0.5556,
      new_in_recent_window: 81, total_observations: 81, sources: 47, disabled_sources: 0,
      by_sport: { baseball: 67 }, by_provider: { "gdelt-gkg": 81 }, by_source_quality: { unknown: 77, known: 4 }, by_status: { new: 36, duplicate: 45 },
      rejections_total: 1, rejections_by_reason: { "betting-or-fantasy": 1 },
      top_headline_groups: [{ sample_headline: "Sample wire headline", source_count: 11, candidate_count: 11 }],
      latest_run: null, runs_by_status: { succeeded: 2 },
    };
    const text = formatStatsReport(stats);
    expect(text).toContain("55.6% of candidates");
    expect(text).toContain("11 sources / 11 candidates — Sample wire headline");
    expect(text).toContain("latest run            (none yet)");
  });
});
