/**
 * Prints an internal summary of the persistent news warehouse.
 *
 *   pnpm news:warehouse:stats
 *   pnpm news:warehouse:stats --json
 */
import { loadDotEnvFiles } from "@/lib/news/cli/load-env";
import { createWarehouseClient, WarehouseConfigError } from "@/lib/news/warehouse/client";
import { formatStatsReport } from "@/lib/news/warehouse/report";
import { getWarehouseStats } from "@/lib/news/warehouse/stats";

loadDotEnvFiles();

async function main() {
  const stats = await getWarehouseStats(createWarehouseClient());
  console.log(process.argv.includes("--json") ? JSON.stringify(stats, null, 2) : formatStatsReport(stats));
}

main().catch((error) => {
  if (error instanceof WarehouseConfigError) {
    console.error(`news:warehouse:stats: ${error.message}`);
  } else {
    console.error("news:warehouse:stats: unexpected failure");
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
