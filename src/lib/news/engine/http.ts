import { checkBearerSecret } from "./auth";
import { ENGINE_PROVIDERS } from "./config";
import type { TickResult } from "./tick";

const MAX_BODY_BYTES = 4_096;

const HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
} as const;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

export interface TickRequestDeps {
  env: Record<string, string | undefined>;
  /** Runs the shared orchestration. Injected so the handler is testable without a database. */
  runTick(input: { providerId?: string }): Promise<TickResult>;
}

/**
 * Logic of `POST /api/internal/newsroom/tick`, kept out of the route file so it
 * is unit-testable. Contract:
 *   401 missing/invalid bearer secret · 503 secret not configured on the host (never open)
 *   400 malformed body / unknown provider · 200 tick executed (skips included; see `ok`)
 *   500 unexpected failure — generic body, details stay in server logs
 * The handler always runs with trigger "scheduled"; manual runs use the CLI.
 * It never echoes secrets, env values or stack traces.
 */
export async function handleTickRequest(request: Request, deps: TickRequestDeps): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method-not-allowed" });

  const auth = checkBearerSecret(request.headers.get("authorization"), deps.env.NEWSROOM_CRON_SECRET);
  if (auth === "not-configured") return json(503, { error: "worker-not-configured" });
  if (auth !== "ok") return json(401, { error: "unauthorized" });

  let providerId: string | undefined;
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(400, { error: "body-too-large" });
  if (raw.trim().length > 0) {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { error: "invalid-json" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return json(400, { error: "invalid-body" });
    const requested = (body as { provider?: unknown }).provider;
    if (requested !== undefined && requested !== null) {
      if (typeof requested !== "string" || !ENGINE_PROVIDERS.some((config) => config.providerId === requested)) {
        return json(400, { error: "unknown-provider" });
      }
      providerId = requested;
    }
  }

  try {
    return json(200, await deps.runTick({ providerId }));
  } catch (error) {
    console.error("newsroom tick failed:", error instanceof Error ? error.message : "unknown error");
    return json(500, { error: "tick-failed" });
  }
}
