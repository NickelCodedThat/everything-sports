import type { CandidateProvider } from "../providers/types";
import { getProviderPolicy } from "../policy/registry";
import type { WarehouseClient } from "./client";
import type { WarehouseProviderRow } from "./types";

export class ProviderNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderNotAllowedError";
  }
}

/**
 * Registers (or refreshes) a provider row from code. Only the descriptive
 * columns are written on conflict — the operational `status` belongs to the
 * database, so an operator's 'disabled'/'degraded' survives a sync. Policy
 * stays canonical in the registry; `policy_status` is just a copy.
 * Refuses providers the registry does not approve.
 */
export async function syncProvider(client: WarehouseClient, provider: CandidateProvider): Promise<WarehouseProviderRow> {
  const policy = getProviderPolicy(provider.id);
  if (!policy || policy.status !== "approved") {
    throw new ProviderNotAllowedError(
      `Provider "${provider.id}" is not policy-approved (${policy?.status ?? "no policy record"}); it cannot feed the warehouse`,
    );
  }

  const { data, error } = await client
    .from("news_providers")
    .upsert(
      {
        provider_key: provider.id,
        display_name: provider.displayName,
        expected_freshness: provider.expectedFreshness,
        requires_api_key: provider.requiresApiKey,
        policy_status: policy.status,
      },
      { onConflict: "provider_key" },
    )
    .select()
    .single();

  if (error) throw new Error(`syncProvider(${provider.id}) failed: ${error.message}`);

  if (data.status === "disabled") {
    throw new ProviderNotAllowedError(`Provider "${provider.id}" is disabled in the warehouse (news_providers.status)`);
  }
  return data;
}

export async function setProviderStatus(
  client: WarehouseClient,
  providerKey: string,
  status: WarehouseProviderRow["status"],
): Promise<void> {
  const { error } = await client.from("news_providers").update({ status }).eq("provider_key", providerKey);
  if (error) throw new Error(`setProviderStatus(${providerKey}) failed: ${error.message}`);
}
