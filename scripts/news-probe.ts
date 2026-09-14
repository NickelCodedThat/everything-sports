/**
 * Everything Sports newsroom CLI probe.
 *
 * Usage:
 *   pnpm news:probe
 *   pnpm news:probe --provider=gdelt --sport=basketball --window=3h --limit=20
 *   pnpm news:probe --provider=all --json
 *
 * Runs outside Next.js (via tsx), so it loads .env.local/.env itself. Prints
 * candidate metadata only — no article bodies, no secrets.
 */
import { loadDotEnvFiles } from "@/lib/news/cli/load-env";
import { InvalidCliArgError, parseProbeArgs } from "@/lib/news/cli/parse-args";
import { formatHumanReport, formatJsonReport } from "@/lib/news/cli/report";
import { fetchNewsCandidates } from "@/lib/news/newsroom";
import {
  ALL_CANDIDATE_PROVIDERS,
  APPROVED_CANDIDATE_PROVIDERS,
  getCandidateProviderById,
} from "@/lib/news/providers";
import type { CandidateProvider } from "@/lib/news/providers/types";

// NewsData's provider reads process.env lazily inside fetchCandidates(), so
// loading .env files here — before main() runs — is sufficient even though
// the provider modules above are imported first.
loadDotEnvFiles();

function resolveProviders(providerArg: string): CandidateProvider[] {
  if (providerArg === "all") return APPROVED_CANDIDATE_PROVIDERS;

  const provider = getCandidateProviderById(providerArg);
  if (!provider) {
    throw new Error(
      `Unknown provider "${providerArg}". Known providers: ${ALL_CANDIDATE_PROVIDERS.map((p) => p.id).join(", ")}`,
    );
  }
  return [provider];
}

async function main() {
  let options;
  try {
    options = parseProbeArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof InvalidCliArgError) {
      console.error(`news:probe: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const providers = resolveProviders(options.provider);

  const result = await fetchNewsCandidates({
    providers,
    sport: options.sport,
    window: options.window,
    limit: options.limit,
  });

  const report = options.json ? formatJsonReport(result, options) : formatHumanReport(result, options);
  console.log(report);
}

main().catch((error) => {
  console.error("news:probe: unexpected failure");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
