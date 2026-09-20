import type { Sport } from "@/types/sport";
import { QUERYABLE_SPORTS } from "../queries/sport-profiles";

export type ProbeProviderArg = "gdelt" | "gdelt-gkg" | "newsdata" | "wikipedia-events" | "local" | "all";

export interface ProbeCliOptions {
  provider: ProbeProviderArg;
  sport: Sport | "all";
  window: string;
  limit: number;
  json: boolean;
}

export class InvalidCliArgError extends Error {}

const VALID_PROVIDERS: ProbeProviderArg[] = ["gdelt", "gdelt-gkg", "newsdata", "wikipedia-events", "local", "all"];

const DEFAULT_OPTIONS: ProbeCliOptions = {
  provider: "all",
  sport: "all",
  window: "3h",
  limit: 25,
  json: false,
};

/**
 * Pure argument parser for `pnpm news:probe` — kept separate from the
 * executable script so it's unit-testable without spawning a process.
 * Conservative defaults per the brief: all approved providers, every sport
 * profile, a 3h window, 25 results per profile.
 */
export function parseProbeArgs(argv: string[]): ProbeCliOptions {
  const options: ProbeCliOptions = { ...DEFAULT_OPTIONS };

  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
      continue;
    }

    const separatorIndex = arg.indexOf("=");
    if (!arg.startsWith("--") || separatorIndex === -1) {
      throw new InvalidCliArgError(`Unknown argument "${arg}". Expected --flag=value or --json.`);
    }

    const flag = arg.slice(0, separatorIndex);
    const value = arg.slice(separatorIndex + 1);

    switch (flag) {
      case "--provider":
        if (!VALID_PROVIDERS.includes(value as ProbeProviderArg)) {
          throw new InvalidCliArgError(
            `Unknown --provider "${value}". Expected one of: ${VALID_PROVIDERS.join(", ")}`,
          );
        }
        options.provider = value as ProbeProviderArg;
        break;

      case "--sport":
        if (value !== "all" && !QUERYABLE_SPORTS.includes(value as Sport)) {
          throw new InvalidCliArgError(
            `Unknown --sport "${value}". Expected one of: all, ${QUERYABLE_SPORTS.join(", ")}`,
          );
        }
        options.sport = value as Sport | "all";
        break;

      case "--window":
        if (!value) throw new InvalidCliArgError("--window requires a value, e.g. --window=3h");
        options.window = value;
        break;

      case "--limit": {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new InvalidCliArgError(`--limit must be a positive number, got "${value}"`);
        }
        options.limit = Math.floor(parsed);
        break;
      }

      default:
        throw new InvalidCliArgError(`Unknown argument "${flag}"`);
    }
  }

  return options;
}
