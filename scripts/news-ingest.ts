/**
 * Everything Sports warehouse ingestion CLI.
 *
 *   pnpm news:ingest                                  # gdelt-gkg, last 2h (8 files)
 *   pnpm news:ingest --provider=gdelt-gkg --window=2h
 *   pnpm news:ingest --provider=wikipedia-events --window=3d
 *   pnpm news:ingest --json
 *
 * Server-side only: reads SUPABASE_URL and SUPABASE_SECRET_KEY from the
 * environment / .env.local. Prints counts and ids, never credentials. Safe to
 * run repeatedly — see docs/NEWS-WAREHOUSE.md (idempotency).
 */
import { loadDotEnvFiles } from "@/lib/news/cli/load-env";
import { InvalidCliArgError } from "@/lib/news/cli/parse-args";
import { parseIngestArgs } from "@/lib/news/cli/parse-ingest-args";
import { ALL_CANDIDATE_PROVIDERS, getCandidateProviderById } from "@/lib/news/providers";
import { createWarehouseClient, WarehouseConfigError } from "@/lib/news/warehouse/client";
import { runWarehouseIngestion } from "@/lib/news/warehouse/ingest";
import { ProviderNotAllowedError } from "@/lib/news/warehouse/providers";
import { formatIngestReport } from "@/lib/news/warehouse/report";

loadDotEnvFiles();

async function main() {
  const options = parseIngestArgs(process.argv.slice(2));

  const provider = getCandidateProviderById(options.provider);
  if (!provider) {
    throw new InvalidCliArgError(
      `Unknown provider "${options.provider}". Known providers: ${ALL_CANDIDATE_PROVIDERS.map((p) => p.id).join(", ")}`,
    );
  }

  const client = createWarehouseClient();
  const report = await runWarehouseIngestion(client, { provider, window: options.window, limit: options.limit });

  console.log(options.json ? JSON.stringify({ options, ...report }, null, 2) : formatIngestReport(report, provider.id));
  if (report.run.status === "failed") process.exitCode = 2;
}

main().catch((error) => {
  if (error instanceof InvalidCliArgError || error instanceof WarehouseConfigError || error instanceof ProviderNotAllowedError) {
    console.error(`news:ingest: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.error("news:ingest: unexpected failure");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
