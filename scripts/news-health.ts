/**
 * Newsroom health and alert conditions.
 *
 *   pnpm news:health                 # human report
 *   pnpm news:health --json
 *   pnpm news:health --strict        # exit 3 when any critical alert exists (for a future notifier)
 *   pnpm news:health --scheduler     # also report pg_cron / pg_net / Vault wiring (Supabase only)
 *
 * Reads run history only — no network calls to any news provider. Prints states,
 * counts and stamps; never credentials.
 */
import { loadDotEnvFiles } from "@/lib/news/cli/load-env";
import { collectNewsroomHealth } from "@/lib/news/engine/health-data";
import { formatHealthReport } from "@/lib/news/engine/report";
import { createWarehouseClient, WarehouseConfigError } from "@/lib/news/warehouse/client";

loadDotEnvFiles();

async function main() {
  const argv = process.argv.slice(2);
  const known = new Set(["--json", "--strict", "--scheduler"]);
  const unknown = argv.find((arg) => !known.has(arg));
  if (unknown) throw new WarehouseConfigError(`Unknown argument "${unknown}"`);

  const health = await collectNewsroomHealth(createWarehouseClient(), { includeScheduler: argv.includes("--scheduler") });
  console.log(argv.includes("--json") ? JSON.stringify(health, null, 2) : formatHealthReport(health));
  if (argv.includes("--strict") && health.alerts.some((alert) => alert.severity === "critical")) process.exitCode = 3;
}

main().catch((error) => {
  if (error instanceof WarehouseConfigError) console.error(`news:health: ${error.message}`);
  else {
    console.error("news:health: unexpected failure");
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
