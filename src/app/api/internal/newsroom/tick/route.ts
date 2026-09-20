import "server-only";
import { createTickDeps, handleTickRequest, runScheduledTick } from "@/lib/news/engine";
import { createWarehouseClient } from "@/lib/news/warehouse/client";

/**
 * Internal newsroom worker — invoked by Supabase Cron (pg_cron → pg_net) with
 * `Authorization: Bearer $NEWSROOM_CRON_SECRET`. POST only; every other method
 * is 405. Not linked anywhere, not indexed (X-Robots-Tag + site-wide robots
 * disallow), never cached. All logic lives in `@/lib/news/engine` so the CLI
 * (`pnpm news:worker`) runs the identical orchestration.
 *
 * Runs on the Node.js runtime on purpose: the GKG provider unzips with node:zlib.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handleTickRequest(request, {
    env: process.env,
    runTick: ({ providerId }) =>
      runScheduledTick({
        deps: createTickDeps(createWarehouseClient()),
        providerId,
        trigger: "scheduled",
      }),
  });
}
