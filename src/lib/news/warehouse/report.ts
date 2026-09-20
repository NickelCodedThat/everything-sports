import type { WarehouseRunReport } from "./ingest";
import type { WarehouseStats } from "./types";

/** Human-readable ingestion summary for the CLI. Contains counts and ids only — never credentials. */
export function formatIngestReport(report: WarehouseRunReport, providerKey: string): string {
  const { run, totals } = report;
  const lines = [
    `Warehouse ingestion — provider=${providerKey} window=${run.window_label ?? "-"}`,
    "",
    `run id            ${run.id}`,
    `provider          ${providerKey}`,
    `status            ${run.status} (provider state: ${report.providerState})`,
    `units processed   ${report.unitsProcessed}   skipped (already stored): ${report.unitsSkipped}`,
    `returned          ${report.returned}`,
    `accepted          ${report.accepted}`,
    `rejected          ${report.rejected}  (${totals.rejectionsRecorded} new rejection rows, ${totals.rejectionsSeenAgain} seen before)`,
    `inserted          ${totals.inserted}`,
    `duplicate URL     ${totals.existingUrl + totals.existingProviderItem}`,
    `duplicate headline ${totals.duplicateHeadline}  (stored, linked to their headline group)`,
    `observations      ${totals.observationsCreated}`,
    `sources created   ${totals.sourcesCreated}`,
    `disabled-source   ${totals.disabledSourceRejected}`,
    `duration          ${report.durationMs}ms`,
  ];
  if (report.errors.length > 0) {
    lines.push("", "notes/errors:");
    for (const message of report.errors) lines.push(`  - ${message}`);
  }
  return lines.join("\n");
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length === 0 ? "(none)" : entries.map(([key, value]) => `${key}: ${value}`).join(", ");
}

export function formatStatsReport(stats: WarehouseStats): string {
  const run = stats.latest_run;
  const lines = [
    "Everything Sports news warehouse — stats (internal)",
    "",
    `candidates            ${stats.total_candidates}`,
    `distinct headlines    ${stats.distinct_headlines}`,
    `duplicate-headline    ${stats.duplicate_headline_candidates} (${(stats.duplicate_headline_rate * 100).toFixed(1)}% of candidates)`,
    `new in last 24h       ${stats.new_in_recent_window}`,
    `observations          ${stats.total_observations}`,
    `sources               ${stats.sources} (${stats.disabled_sources} disabled)`,
    "",
    `by sport              ${formatCounts(stats.by_sport)}`,
    `by provider           ${formatCounts(stats.by_provider)}`,
    `by source quality     ${formatCounts(stats.by_source_quality)}`,
    `by status             ${formatCounts(stats.by_status)}`,
    "",
    `rejections            ${stats.rejections_total} — ${formatCounts(stats.rejections_by_reason)}`,
    `runs                  ${formatCounts(stats.runs_by_status)}`,
  ];
  if (stats.top_headline_groups.length > 0) {
    lines.push("", "most widely carried headlines:");
    for (const group of stats.top_headline_groups) {
      lines.push(`  ${group.source_count} sources / ${group.candidate_count} candidates — ${group.sample_headline}`);
    }
  }
  if (run) {
    lines.push(
      "",
      `latest run            ${run.id} (${run.provider_key}) ${run.status}/${run.provider_state ?? "-"}`,
      `                      returned ${run.records_returned}, accepted ${run.records_accepted}, rejected ${run.records_rejected}, inserted ${run.records_inserted}, dup URL ${run.records_duplicate_url}, dup headline ${run.records_duplicate_headline}, units ${run.units_processed}+${run.units_skipped} skipped`,
    );
  } else {
    lines.push("", "latest run            (none yet)");
  }
  return lines.join("\n");
}
