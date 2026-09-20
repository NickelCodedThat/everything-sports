/**
 * Editorial ranking CLI — ranks story CLUSTERS (never raw candidates) and keeps one editorial
 * item per cluster.
 *
 *   pnpm news:rank                          # rank clusters active in the last 24h, persist items
 *   pnpm news:rank --dry-run                # compute and report; write NOTHING
 *   pnpm news:rank --window=48h --sport=basketball --top=40 --explain --json
 *
 * Internal only. Reads/writes the warehouse; makes no provider call.
 */
import { loadDotEnvFiles } from "@/lib/news/cli/load-env";
import { InvalidCliArgError } from "@/lib/news/cli/parse-args";
import { parseRankArgs } from "@/lib/news/editorial-ranking/cli";
import { formatRankReport, summarizeRanked } from "@/lib/news/editorial-ranking/report";
import { runEditorialRanking } from "@/lib/news/editorial-ranking/run";
import { createWarehouseClient, WarehouseConfigError } from "@/lib/news/warehouse/client";

loadDotEnvFiles();

async function main() {
  const options = parseRankArgs(process.argv.slice(2));
  const report = await runEditorialRanking(createWarehouseClient(), { window: options.window, sport: options.sport, dryRun: options.dryRun, trigger: "manual" });
  if (options.json) {
    const { ranked, ...rest } = report;
    console.log(JSON.stringify({ ...rest, ranked: ranked.slice(0, options.top).map(summarizeRanked) }, null, 2));
  } else console.log(formatRankReport(report, { top: options.top, explain: options.explain }));
  if (report.status === "failed") process.exitCode = 2;
}

main().catch((error) => {
  if (error instanceof InvalidCliArgError || error instanceof WarehouseConfigError) console.error(`news:rank: ${error.message}`);
  else {
    console.error("news:rank: unexpected failure");
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
