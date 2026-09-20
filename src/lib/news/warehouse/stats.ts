import type { WarehouseClient } from "./client";
import type { WarehouseStats } from "./types";

/** Internal/debug warehouse summary. `recentWindow` is a Postgres interval, e.g. "24 hours". */
export async function getWarehouseStats(client: WarehouseClient, recentWindow = "24 hours"): Promise<WarehouseStats> {
  const { data, error } = await client.rpc("news_warehouse_stats", { p_recent: recentWindow });
  if (error) throw new Error(`news_warehouse_stats failed: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("news_warehouse_stats returned no result");
  return data as unknown as WarehouseStats;
}
