/**
 * Story clustering CLI — groups warehouse candidates that report the same event.
 *
 *   pnpm news:cluster                         # cluster recent (24h) unclustered candidates
 *   pnpm news:cluster --dry-run               # decide and report; write NOTHING
 *   pnpm news:cluster --window=72h --sport=basketball
 *   pnpm news:cluster --limit=500 --json
 *
 * Internal only. Reads/writes the local or configured Supabase warehouse; makes no network
 * call to any news provider. Prints ids, headlines, scores and evidence — never credentials.
 */
import { parseClusterArgs } from "@/lib/news/clustering/cli";
import { formatClusterRunReport } from "@/lib/news/clustering/report";
import { runClustering } from "@/lib/news/clustering/run";
import { loadDotEnvFiles } from "@/lib/news/cli/load-env";
import { InvalidCliArgError } from "@/lib/news/cli/parse-args";
import { createWarehouseClient, WarehouseConfigError } from "@/lib/news/warehouse/client";

loadDotEnvFiles();

async function main() {
  const options = parseClusterArgs(process.argv.slice(2));
  const report = await runClustering(createWarehouseClient(), {
    window: options.window,
    sport: options.sport,
    limit: options.limit,
    dryRun: options.dryRun,
    trigger: "manual",
  });
  console.log(options.json ? JSON.stringify(report, null, 2) : formatClusterRunReport(report, { verbose: options.dryRun }));
  if (report.status === "failed") process.exitCode = 2;
}

main().catch((error) => {
  if (error instanceof InvalidCliArgError || error instanceof WarehouseConfigError) console.error(`news:cluster: ${error.message}`);
  else {
    console.error("news:cluster: unexpected failure");
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
