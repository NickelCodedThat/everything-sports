/**
 * Story cluster inspection and internal operations.
 *
 *   pnpm news:clusters                          # freshest clusters (multi-source first with --min-sources)
 *   pnpm news:clusters --sport=baseball --min-sources=3 --sort=most-sources --limit=10
 *   pnpm news:clusters --event-type=injury --confidence=high --since=24h
 *   pnpm news:clusters --show=<cluster-id>      # one cluster with every member
 *   pnpm news:clusters --review                 # the needs-review (near-miss) queue
 *   pnpm news:clusters --merge=<into-id>,<from-id> [--reason="..."]
 *   pnpm news:clusters --move=<candidate-id>,<to-cluster-id>
 *   pnpm news:clusters --json
 *
 * Internal only; prints headlines, counts and ids — no article bodies, no credentials.
 */
import { loadDotEnvFiles } from "@/lib/news/cli/load-env";
import { InvalidCliArgError } from "@/lib/news/cli/parse-args";
import { parseWindowMs } from "@/lib/news/clustering/run";
import { getCluster, listClusters, listReviewQueue, mergeClusters, moveMember, type ClusterQuery } from "@/lib/news/clustering/queries";
import { formatCluster, formatReviewQueue } from "@/lib/news/clustering/report";
import type { EventType, MatchConfidence } from "@/lib/news/clustering/config";
import { createWarehouseClient, WarehouseConfigError } from "@/lib/news/warehouse/client";

loadDotEnvFiles();

interface Options {
  query: ClusterQuery;
  show?: string;
  review: boolean;
  merge?: [string, string];
  move?: [string, string];
  reason?: string;
  json: boolean;
}

function parse(argv: string[]): Options {
  const options: Options = { query: { includeMembers: false }, review: false, json: false };
  const pair = (value: string, flag: string): [string, string] => {
    const parts = value.split(",");
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new InvalidCliArgError(`${flag} needs two comma-separated ids`);
    return [parts[0], parts[1]];
  };
  for (const arg of argv) {
    const [flag, ...rest] = arg.split("=");
    const value = rest.join("=");
    switch (flag) {
      case "--json": options.json = true; break;
      case "--review": options.review = true; break;
      case "--members": options.query.includeMembers = true; break;
      case "--sport": options.query.sport = value; break;
      case "--event-type": options.query.eventType = value as EventType; break;
      case "--confidence": options.query.minConfidence = value as MatchConfidence; break;
      case "--min-sources": options.query.minSources = Number(value); break;
      case "--limit": options.query.limit = Number(value); break;
      case "--sort":
        if (value !== "freshest" && value !== "most-sources") throw new InvalidCliArgError('--sort must be "freshest" or "most-sources"');
        options.query.sort = value;
        break;
      case "--since": {
        try { options.query.since = new Date(Date.now() - parseWindowMs(value)); } catch { throw new InvalidCliArgError(`--since must look like 24h or 3d, got "${value}"`); }
        break;
      }
      case "--show": options.show = value; break;
      case "--merge": options.merge = pair(value, "--merge"); break;
      case "--move": options.move = pair(value, "--move"); break;
      case "--reason": options.reason = value; break;
      default: throw new InvalidCliArgError(`Unknown argument "${arg}"`);
    }
  }
  return options;
}

async function main() {
  const options = parse(process.argv.slice(2));
  const client = createWarehouseClient();
  const print = (value: unknown, text: string) => console.log(options.json ? JSON.stringify(value, null, 2) : text);

  if (options.merge) {
    const [into, from] = options.merge;
    const result = await mergeClusters(client, into, from, options.reason);
    return print(result, `Merged ${from} into ${into}: ${result.membersMoved} members moved. ${from} is archived (closed, merged_into set).`);
  }
  if (options.move) {
    const [candidateId, to] = options.move;
    const result = await moveMember(client, candidateId, to);
    return print(result, result.moved ? `Moved ${candidateId} to ${to}.` : "Already in that cluster.");
  }
  if (options.review) {
    const items = await listReviewQueue(client, options.query.limit ?? 50);
    return print(items, formatReviewQueue(items));
  }
  if (options.show) {
    const cluster = await getCluster(client, options.show);
    if (!cluster) throw new InvalidCliArgError(`No live cluster with id ${options.show}`);
    return print(cluster, formatCluster(cluster));
  }
  const clusters = await listClusters(client, { ...options.query, includeMembers: true });
  print(clusters, clusters.length ? clusters.map(formatCluster).join("\n\n") : "No clusters match. Run `pnpm news:cluster` first.");
}

main().catch((error) => {
  if (error instanceof InvalidCliArgError || error instanceof WarehouseConfigError) console.error(`news:clusters: ${error.message}`);
  else {
    console.error("news:clusters: unexpected failure");
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
