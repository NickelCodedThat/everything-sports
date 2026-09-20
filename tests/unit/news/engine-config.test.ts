import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINE_PROVIDERS, STALE_RUN_AFTER_MINUTES, assessSchedulability, getEngineConfig } from "@/lib/news/engine/config";
import { getProviderPolicy } from "@/lib/news/policy/registry";

const scheduleSql = readFileSync(join(process.cwd(), "supabase", "migrations", "20260920120100_newsroom_schedule.sql"), "utf8");

describe("engine provider configuration", () => {
  it("schedules GKG every 15 minutes, Wikipedia hourly, NewsData every 6 hours, never the DOC API", () => {
    expect(getEngineConfig("gdelt-gkg")?.scheduleClass).toBe("every-15-minutes");
    expect(getEngineConfig("wikipedia-events")?.scheduleClass).toBe("hourly");
    expect(getEngineConfig("newsdata")?.scheduleClass).toBe("every-6-hours");
    expect(getEngineConfig("gdelt")?.scheduleClass).toBe("manual-only");
  });

  it("polls a slower source slower: min intervals scale with cadence", () => {
    const min = (id: string) => getEngineConfig(id)!.minIntervalMinutes;
    expect(min("gdelt-gkg")).toBeLessThan(min("wikipedia-events"));
    expect(min("wikipedia-events")).toBeLessThan(min("newsdata"));
  });

  it("keeps the GKG lookback wide enough to self-heal a short outage but within the provider's file cap", () => {
    expect(getEngineConfig("gdelt-gkg")?.window).toBe("3h"); // 12 files
  });

  it("does not let config override provider policy: a config for an unapproved provider is never schedulable", () => {
    const rejected = { ...getEngineConfig("wikipedia-events")!, providerId: "gnews" };
    expect(getProviderPolicy("gnews")?.status).not.toBe("approved");
    expect(assessSchedulability(rejected, {})).toMatchObject({ schedulable: false, reason: "not-approved" });
  });

  it("manual-only providers are not schedulable", () => {
    expect(assessSchedulability(getEngineConfig("gdelt")!, {})).toMatchObject({ schedulable: false, reason: "manual-only" });
  });

  it("an API-key provider is schedulable only when its env var is set", () => {
    const newsdata = getEngineConfig("newsdata")!;
    expect(assessSchedulability(newsdata, {})).toMatchObject({ schedulable: false, reason: "missing-env" });
    expect(assessSchedulability(newsdata, { NEWSDATA_API_KEY: "  " })).toMatchObject({ schedulable: false, reason: "missing-env" });
    expect(assessSchedulability(newsdata, { NEWSDATA_API_KEY: "k" })).toEqual({ schedulable: true });
  });

  it("config can turn a provider off", () => {
    expect(assessSchedulability({ ...getEngineConfig("wikipedia-events")!, enabled: false }, {})).toMatchObject({ reason: "disabled-by-config" });
  });

  it("uses a conservative stale-run threshold that the SQL job also uses", () => {
    expect(STALE_RUN_AFTER_MINUTES).toBe(30);
    expect(scheduleSql).toContain("news_reap_stale_runs(interval '30 minutes')");
  });
});

describe("cron migration ↔ engine config parity", () => {
  it("installs each scheduled provider's cron expression exactly as configured", () => {
    for (const config of ENGINE_PROVIDERS.filter((c) => c.scheduleClass !== "manual-only")) {
      expect(config.cron).toBeTruthy();
      expect(scheduleSql).toContain(`'${config.cron}', $cmd$select public.newsroom_invoke_worker('${config.providerId}')$cmd$`);
    }
  });

  it("does not schedule the throttled GDELT DOC API", () => {
    expect(scheduleSql).not.toMatch(/newsroom_invoke_worker\('gdelt'\)/);
  });
});
