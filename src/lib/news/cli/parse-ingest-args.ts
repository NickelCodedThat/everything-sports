import { InvalidCliArgError } from "./parse-args";

export interface IngestCliOptions {
  provider: string;
  window: string;
  limit: number;
  json: boolean;
}

const DEFAULTS: IngestCliOptions = { provider: "gdelt-gkg", window: "2h", limit: 25, json: false };

/**
 * Argument parser for `pnpm news:ingest`. Defaults to the validated keyless
 * provider (gdelt-gkg) and a 2-hour window (8 GKG files).
 */
export function parseIngestArgs(argv: string[]): IngestCliOptions {
  const options: IngestCliOptions = { ...DEFAULTS };

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
        if (!value) throw new InvalidCliArgError("--provider requires a value, e.g. --provider=gdelt-gkg");
        options.provider = value;
        break;
      case "--window":
        if (!/^\d+(min|h|d|w|m)$/.test(value)) {
          throw new InvalidCliArgError(`--window must look like 30min, 2h or 1d, got "${value}"`);
        }
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
