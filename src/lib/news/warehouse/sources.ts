import type { WarehouseClient } from "./client";
import type { WarehouseSourceRow } from "./types";

export async function getSourceByDomain(client: WarehouseClient, domain: string): Promise<WarehouseSourceRow | null> {
  const { data, error } = await client.from("news_sources").select("*").eq("domain", domain.toLowerCase()).maybeSingle();
  if (error) throw new Error(`getSourceByDomain failed: ${error.message}`);
  return data;
}

export async function listSources(client: WarehouseClient, limit = 100): Promise<WarehouseSourceRow[]> {
  const { data, error } = await client.from("news_sources").select("*").order("domain").limit(limit);
  if (error) throw new Error(`listSources failed: ${error.message}`);
  return data;
}

/**
 * Switches a publisher on or off without a deploy. Future candidates from a
 * disabled source are recorded as `disabled-source` rejections instead of
 * being ingested; existing rows are untouched.
 */
export async function setSourceEnabled(client: WarehouseClient, domain: string, isEnabled: boolean): Promise<void> {
  const { data, error } = await client
    .from("news_sources")
    .update({ is_enabled: isEnabled })
    .eq("domain", domain.toLowerCase())
    .select("id");
  if (error) throw new Error(`setSourceEnabled failed: ${error.message}`);
  if (data.length === 0) throw new Error(`setSourceEnabled: no source with domain "${domain}"`);
}
