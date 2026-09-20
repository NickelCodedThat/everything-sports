import { describe, expect, it } from "vitest";
import { WarehouseConfigError, createWarehouseClient } from "@/lib/news/warehouse/client";

describe("createWarehouseClient", () => {
  const base = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: "sb_secret_test_value" };

  it("builds a client from server-only variables", () => {
    expect(createWarehouseClient(base)).toBeDefined();
  });

  it("fails clearly when the URL or key is missing, without echoing any secret", () => {
    expect(() => createWarehouseClient({ SUPABASE_SECRET_KEY: "sb_secret_hunter2" })).toThrow(WarehouseConfigError);
    try {
      createWarehouseClient({ SUPABASE_URL: "http://x" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toMatch(/SUPABASE_SECRET_KEY is not set/);
    }
  });

  it("refuses a publishable key in the secret slot", () => {
    const env = { ...base, SUPABASE_SECRET_KEY: "sb_publishable_abc123" };
    expect(() => createWarehouseClient(env)).toThrow(/publishable/);
    expect(() => createWarehouseClient(env)).not.toThrow(/abc123/);
  });

  it("accepts the legacy service-role variable only as a fallback", () => {
    const legacy = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "legacy.jwt.value" };
    expect(createWarehouseClient(legacy)).toBeDefined();
  });

  it("never reads a NEXT_PUBLIC_* variable", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_SECRET_KEY: "sb_secret_x" };
    expect(() => createWarehouseClient(env)).toThrow(WarehouseConfigError);
  });
});
