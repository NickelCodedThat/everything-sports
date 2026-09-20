import { InvalidCliArgError } from "../cli/parse-args";
import { parseWindowMs } from "../clustering/run";

export interface RankCliOptions {
  window: string;
  sport?: string;
  dryRun: boolean;
  json: boolean;
  explain: boolean;
  top: number;
}

const SPORTS = [
  "basketball",
  "football",
  "baseball",
  "boxing",
  "mma",
  "soccer",
  "hockey",
  "tennis",
  "golf",
  "motorsports",
  "olympics",
  "other",
  "unknown",
];

/** Arguments for `pnpm news:rank`. */
export function parseRankArgs(argv: string[]): RankCliOptions {
  const options: RankCliOptions = {
    window: "24h",
    dryRun: false,
    json: false,
    explain: false,
    top: 25,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--explain") options.explain = true;
    else if (arg.startsWith("--window=")) {
      const value = arg.slice(9);
      try {
        parseWindowMs(value);
      } catch {
        throw new InvalidCliArgError(
          `--window must look like 30min, 24h, 3d or 1w, got "${value}"`,
        );
      }
      options.window = value;
    } else if (arg.startsWith("--sport=")) {
      const value = arg.slice(8);
      if (!SPORTS.includes(value))
        throw new InvalidCliArgError(
          `--sport must be one of ${SPORTS.join(", ")}, got "${value}"`,
        );
      options.sport = value;
    } else if (arg.startsWith("--top=")) {
      const value = Number(arg.slice(6));
      if (!Number.isInteger(value) || value <= 0)
        throw new InvalidCliArgError(
          `--top must be a positive integer, got "${arg.slice(6)}"`,
        );
      options.top = value;
    } else
      throw new InvalidCliArgError(
        `Unknown argument "${arg}". Flags: --window= --sport= --top= --explain --dry-run --json`,
      );
  }
  return options;
}

export interface SlateCliOptions {
  json: boolean;
  explain: boolean;
  /** Rank first (real run) so the slate reflects "now". */
  refresh: boolean;
  window: string;
}

export function parseSlateArgs(argv: string[]): SlateCliOptions {
  const options: SlateCliOptions = {
    json: false,
    explain: false,
    refresh: false,
    window: "24h",
  };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--explain") options.explain = true;
    else if (arg === "--refresh") options.refresh = true;
    else if (arg.startsWith("--window=")) {
      const value = arg.slice(9);
      try {
        parseWindowMs(value);
      } catch {
        throw new InvalidCliArgError(
          `--window must look like 24h or 3d, got "${value}"`,
        );
      }
      options.window = value;
    } else
      throw new InvalidCliArgError(
        `Unknown argument "${arg}". Flags: --json --explain --refresh --window=`,
      );
  }
  return options;
}

export const FORCE_SECTIONS = [
  "lead",
  "wire",
  "now",
  "run",
  "huddle",
  "diamond",
  "fight-desk",
  "world-game",
  "across-the-board",
];

export type EditorialAction =
  | { type: "list"; status?: string; limit: number }
  | { type: "show"; id: string }
  | { type: "preview"; id: string }
  | {
      type: "status";
      id: string;
      status: "approved" | "held" | "rejected" | "review" | "candidate";
    }
  | { type: "boost"; id: string; amount: number }
  | { type: "suppress"; id: string; amount?: number }
  | { type: "pin"; id: string }
  | { type: "unpin"; id: string }
  | { type: "force-section"; id: string; section: string }
  | { type: "force-priority"; id: string; score: number }
  | { type: "clear-overrides"; id: string; kind?: string };

export interface EditorialCliOptions {
  action: EditorialAction;
  reason?: string;
  json: boolean;
  /** Re-rank after a mutation so its effect is visible immediately. Default true. */
  rerank: boolean;
}

/** Arguments for `pnpm news:editorial`. Exactly one action per invocation. */
export function parseEditorialArgs(argv: string[]): EditorialCliOptions {
  let action: EditorialAction | null = null;
  let reason: string | undefined;
  let json = false;
  let rerank = true;
  let limit = 30;
  let status: string | undefined;
  const set = (next: EditorialAction) => {
    if (action) throw new InvalidCliArgError("Only one action per invocation");
    action = next;
  };
  const need = (value: string, flag: string) => {
    if (!value) throw new InvalidCliArgError(`${flag} needs a value`);
    return value;
  };
  const pair = (value: string, flag: string): [string, string] => {
    const index = value.lastIndexOf(":");
    if (index <= 0 || index === value.length - 1)
      throw new InvalidCliArgError(`${flag} needs <id>:<value>`);
    return [value.slice(0, index), value.slice(index + 1)];
  };

  for (const arg of argv) {
    const eq = arg.indexOf("=");
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const value = eq === -1 ? "" : arg.slice(eq + 1);
    switch (flag) {
      case "--json":
        json = true;
        break;
      case "--no-rank":
        rerank = false;
        break;
      case "--reason":
        reason = need(value, flag);
        break;
      case "--limit":
        limit = Number(value);
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
          throw new InvalidCliArgError(
            "--limit must be an integer between 1 and 1000",
          );
        break;
      case "--status":
        status = need(value, flag);
        if (
          ![
            "candidate",
            "review",
            "approved",
            "held",
            "rejected",
            "published",
          ].includes(status)
        )
          throw new InvalidCliArgError("invalid editorial status");
        break;
      case "--list":
        set({ type: "list", limit });
        break;
      case "--show":
        set({ type: "show", id: need(value, flag) });
        break;
      case "--preview":
        set({ type: "preview", id: need(value, flag) });
        break;
      case "--approve":
        set({ type: "status", id: need(value, flag), status: "approved" });
        break;
      case "--hold":
        set({ type: "status", id: need(value, flag), status: "held" });
        break;
      case "--reject":
        set({ type: "status", id: need(value, flag), status: "rejected" });
        break;
      case "--review":
        set({ type: "status", id: need(value, flag), status: "review" });
        break;
      case "--release":
        set({ type: "status", id: need(value, flag), status: "candidate" });
        break;
      case "--boost": {
        const [id, amount] = pair(value, flag);
        if (!(Number(amount) > 0 && Number(amount) <= 300))
          throw new InvalidCliArgError(
            "--boost amount must be between 1 and 300",
          );
        set({ type: "boost", id, amount: Number(amount) });
        break;
      }
      case "--suppress": {
        if (value.includes(":")) {
          const [id, amount] = pair(value, flag);
          if (!(Number(amount) > 0 && Number(amount) <= 1000))
            throw new InvalidCliArgError(
              "--suppress amount must be between 1 and 1000",
            );
          set({ type: "suppress", id, amount: Number(amount) });
        } else set({ type: "suppress", id: need(value, flag) });
        break;
      }
      case "--pin":
        set({ type: "pin", id: need(value, flag) });
        break;
      case "--unpin":
        set({ type: "unpin", id: need(value, flag) });
        break;
      case "--force-section": {
        const [id, section] = pair(value, flag);
        if (!FORCE_SECTIONS.includes(section))
          throw new InvalidCliArgError(
            `--force-section section must be one of ${FORCE_SECTIONS.join(", ")}`,
          );
        set({ type: "force-section", id, section });
        break;
      }
      case "--force-priority": {
        const [id, score] = pair(value, flag);
        if (
          !score.trim() ||
          !Number.isFinite(Number(score)) ||
          Number(score) < 0 ||
          Number(score) > 1000
        )
          throw new InvalidCliArgError(
            "--force-priority score must be between 0 and 1000",
          );
        set({ type: "force-priority", id, score: Number(score) });
        break;
      }
      case "--clear": {
        if (value.includes(":")) {
          const [id, kind] = pair(value, flag);
          if (
            ![
              "pin",
              "boost",
              "suppress",
              "force_section",
              "force_priority",
            ].includes(kind)
          )
            throw new InvalidCliArgError("invalid override kind");
          set({ type: "clear-overrides", id, kind });
        } else set({ type: "clear-overrides", id: need(value, flag) });
        break;
      }
      default:
        throw new InvalidCliArgError(`Unknown argument "${arg}"`);
    }
  }
  if (!action) action = { type: "list", limit };
  if (action.type === "list") action = { ...action, limit, status };
  return { action, reason, json, rerank };
}
