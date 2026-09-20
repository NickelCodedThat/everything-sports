import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type WarehouseClient = SupabaseClient<Database>;

export class WarehouseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WarehouseConfigError";
  }
}

/**
 * Server-side warehouse client. Uses Supabase's secret key (`sb_secret_…`),
 * which bypasses RLS — so it must never reach a browser: this module imports
 * `server-only`, reads no NEXT_PUBLIC_* variable, and refuses a publishable
 * or anon key (those cannot write the warehouse anyway, and their presence
 * here would signal a misconfiguration).
 *
 * `SUPABASE_SERVICE_ROLE_KEY` (the legacy service_role JWT) is accepted only as a
 * compatibility fallback for projects that have not yet migrated to secret keys.
 * Error messages never include key values.
 */
export function createWarehouseClient(env: Record<string, string | undefined> = process.env): WarehouseClient {
  const url = env.SUPABASE_URL?.trim();
  const secretKey = env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) {
    throw new WarehouseConfigError("SUPABASE_URL is not set — see docs/NEWS-WAREHOUSE.md (local setup)");
  }
  if (!secretKey) {
    throw new WarehouseConfigError(
      "SUPABASE_SECRET_KEY is not set — see docs/NEWS-WAREHOUSE.md (local setup)",
    );
  }
  if (secretKey.startsWith("sb_publishable_")) {
    throw new WarehouseConfigError("SUPABASE_SECRET_KEY holds a publishable key; the warehouse needs the secret key");
  }

  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
