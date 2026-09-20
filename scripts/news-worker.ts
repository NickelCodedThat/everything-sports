/**
 * Runs the newsroom engine's scheduled tick locally — the exact orchestration
 * Supabase Cron triggers in production (reap stale runs → per-provider gates →
 * overlap lock → ingest), not a second implementation.
 *
 *   pnpm news:worker                          # every schedulable provider that is due
 *   pnpm news:worker --provider=gdelt-gkg
 *   pnpm news:worker --force                  # ignore the min-interval "due" check
 *   pnpm news:worker --trigger=manual         # record the run as manual instead of scheduled
 *   pnpm news:worker --json
 *
 * (`pnpm news:ingest` remains the ungated single-provider manual ingest.)
 */
import { loadDotEnvFiles } from "@/lib/news/cli/load-env";
import { ENGINE_PROVIDERS } from "@/lib/news/engine/config";
import { formatTickReport } from "@/lib/news/engine/report";
import { createTickDeps, runScheduledTick, type TickTrigger } from "@/lib/news/engine/tick";
import { createWarehouseClient, WarehouseConfigError } from "@/lib/news/warehouse/client";

loadDotEnvFiles();

class UsageError extends Error {}

function parse(argv: string[]) {
  const options: { provider?: string; force: boolean; trigger: TickTrigger; json: boolean } = { force: false, trigger: "scheduled", json: false };
  for (const arg of argv) {
    if (arg === "--force") options.force = true;
    else if (arg === "--json") options.json = true;
    else if (arg.startsWith("--provider=")) {
      const value = arg.slice("--provider=".length);
      if (!ENGINE_PROVIDERS.some((config) => config.providerId === value)) {
        throw new UsageError(`Unknown provider "${value}". Known: ${ENGINE_PROVIDERS.map((c) => c.providerId).join(", ")}`);
      }
      options.provider = value;
    } else if (arg.startsWith("--trigger=")) {
      const value = arg.slice("--trigger=".length);
      if (value !== "scheduled" && value !== "manual") throw new UsageError('--trigger must be "scheduled" or "manual"');
      options.trigger = value;
    } else {
      throw new UsageError(`Unknown argument "${arg}"`);
    }
  }
  return options;
}

async function main() {
  const options = parse(process.argv.slice(2));
  const result = await runScheduledTick({
    deps: createTickDeps(createWarehouseClient()),
    providerId: options.provider,
    trigger: options.trigger,
    force: options.force,
  });
  console.log(options.json ? JSON.stringify(result, null, 2) : formatTickReport(result));
  if (!result.ok) process.exitCode = 2;
}

main().catch((error) => {
  if (error instanceof UsageError || error instanceof WarehouseConfigError) {
    console.error(`news:worker: ${error.message}`);
  } else {
    console.error("news:worker: unexpected failure");
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
