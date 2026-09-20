import { InvalidCliArgError } from "../cli/parse-args";
import { parseWindowMs } from "./run";

export interface ClusterCliOptions {
  window: string;
  sport?: string;
  limit?: number;
  dryRun: boolean;
  json: boolean;
}

const SPORTS = ["basketball", "football", "baseball", "boxing", "mma", "soccer", "hockey", "tennis", "golf", "motorsports", "olympics", "other", "unknown"];

/** Arguments for `pnpm news:cluster`. */
export function parseClusterArgs(argv: string[]): ClusterCliOptions {
  const options: ClusterCliOptions = { window: "24h", dryRun: false, json: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--json") options.json = true;
    else if (arg.startsWith("--window=")) {
      const value = arg.slice("--window=".length);
      try {
        parseWindowMs(value);
      } catch {
        throw new InvalidCliArgError(`--window must look like 30min, 24h, 3d or 1w, got "${value}"`);
      }
      options.window = value;
    } else if (arg.startsWith("--sport=")) {
      const value = arg.slice("--sport=".length);
      if (!SPORTS.includes(value)) throw new InvalidCliArgError(`--sport must be one of ${SPORTS.join(", ")}, got "${value}"`);
      options.sport = value;
    } else if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(value) || value <= 0) throw new InvalidCliArgError(`--limit must be a positive integer, got "${arg.slice(8)}"`);
      options.limit = value;
    } else {
      throw new InvalidCliArgError(`Unknown argument "${arg}". Flags: --window= --sport= --limit= --dry-run --json`);
    }
  }
  return options;
}
