import { describe, expect, it, vi } from "vitest";
import { MIN_CRON_SECRET_LENGTH, checkBearerSecret } from "@/lib/news/engine/auth";
import { handleTickRequest } from "@/lib/news/engine/http";
import type { TickResult } from "@/lib/news/engine/tick";

const SECRET = "s".repeat(40);
const RESULT: TickResult = { trigger: "scheduled", startedAt: "a", finishedAt: "b", reaped: { count: 0, runIds: [] }, results: [], ok: true };

function post(headers: Record<string, string> = {}, body?: unknown, method = "POST") {
  return new Request("http://localhost/api/internal/newsroom/tick", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const auth = { authorization: `Bearer ${SECRET}` };

function deps(env: Record<string, string | undefined> = { NEWSROOM_CRON_SECRET: SECRET }, runTick = vi.fn(async () => RESULT)) {
  return { env, runTick };
}

describe("checkBearerSecret", () => {
  it("accepts the exact secret and rejects everything else", () => {
    expect(checkBearerSecret(`Bearer ${SECRET}`, SECRET)).toBe("ok");
    expect(checkBearerSecret(`bearer ${SECRET}`, SECRET)).toBe("ok");
    expect(checkBearerSecret(`Bearer ${SECRET}x`, SECRET)).toBe("unauthorized");
    expect(checkBearerSecret(`Bearer ${SECRET.slice(1)}`, SECRET)).toBe("unauthorized");
    expect(checkBearerSecret(SECRET, SECRET)).toBe("unauthorized"); // no scheme
    expect(checkBearerSecret("Basic abc", SECRET)).toBe("unauthorized");
    expect(checkBearerSecret(null, SECRET)).toBe("unauthorized");
    expect(checkBearerSecret("", SECRET)).toBe("unauthorized");
  });

  it("refuses to authenticate anything when the secret is unset or too short — never fails open", () => {
    expect(checkBearerSecret(`Bearer anything`, undefined)).toBe("not-configured");
    expect(checkBearerSecret(`Bearer `, "")).toBe("not-configured");
    expect(checkBearerSecret(`Bearer short`, "short")).toBe("not-configured");
    expect(checkBearerSecret(`Bearer ${"a".repeat(MIN_CRON_SECRET_LENGTH)}`, "a".repeat(MIN_CRON_SECRET_LENGTH))).toBe("ok");
  });
});

describe("POST /api/internal/newsroom/tick handler", () => {
  it("returns 401 without a valid secret, and never runs the tick", async () => {
    const d = deps();
    const bad: Record<string, string>[] = [{}, { authorization: "Bearer wrong-wrong-wrong-wrong-wrong-wrong-xx" }, { authorization: SECRET }];
    for (const headers of bad) {
      const res = await handleTickRequest(post(headers), d);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
    expect(d.runTick).not.toHaveBeenCalled();
  });

  it("returns 503 (not 200, not 401-as-open) when the host has no secret configured", async () => {
    const d = deps({});
    const res = await handleTickRequest(post(auth), d);
    expect(res.status).toBe(503);
    expect(d.runTick).not.toHaveBeenCalled();
  });

  it("rejects non-POST methods", async () => {
    const d = deps();
    expect((await handleTickRequest(post(auth, undefined, "GET"), d)).status).toBe(405);
    expect(d.runTick).not.toHaveBeenCalled();
  });

  it("runs the shared tick and returns its machine-readable result with no-store/noindex headers", async () => {
    const d = deps();
    const res = await handleTickRequest(post(auth, { provider: "gdelt-gkg", trigger: "scheduled" }), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESULT);
    expect(d.runTick).toHaveBeenCalledWith({ providerId: "gdelt-gkg" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("accepts an empty body (run everything due) and provider:null", async () => {
    const d = deps();
    await handleTickRequest(post(auth), d);
    await handleTickRequest(post(auth, { provider: null }), d);
    expect(d.runTick).toHaveBeenNthCalledWith(1, { providerId: undefined });
    expect(d.runTick).toHaveBeenNthCalledWith(2, { providerId: undefined });
  });

  it("ignores a client-supplied trigger — the endpoint always means 'scheduled'", async () => {
    const d = deps();
    await handleTickRequest(post(auth, { provider: "wikipedia-events", trigger: "test" }), d);
    expect(d.runTick).toHaveBeenCalledWith({ providerId: "wikipedia-events" });
  });

  it.each([
    ["invalid JSON", "{nope"],
    ["array body", "[1]"],
    ["non-string provider", { provider: 5 }],
    ["unknown provider", { provider: "../../etc/passwd" }],
    ["oversized body", "x".repeat(5000)],
  ])("400 for %s", async (_name, body) => {
    const d = deps();
    const res = await handleTickRequest(post(auth, body as never), d);
    expect(res.status).toBe(400);
    expect(d.runTick).not.toHaveBeenCalled();
  });

  it("hides internal failure details behind a generic 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const d = deps(undefined, vi.fn(async () => { throw new Error("connect ECONNREFUSED 10.0.0.5 password=hunter2"); }));
    const res = await handleTickRequest(post(auth), d);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe('{"error":"tick-failed"}');
    expect(text).not.toMatch(/hunter2|ECONNREFUSED/);
    spy.mockRestore();
  });

  it("never echoes the secret in any response", async () => {
    const d = deps();
    for (const res of [await handleTickRequest(post(auth), d), await handleTickRequest(post({ authorization: "Bearer nope-nope-nope-nope-nope-nope-nope" }), d)]) {
      expect(await res.text()).not.toContain(SECRET);
    }
  });
});
