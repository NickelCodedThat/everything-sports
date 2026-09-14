import { describe, expect, it } from "vitest";
import { getProviderPolicy, listApprovedProviderIds, PROVIDER_POLICIES } from "@/lib/news/policy/registry";

const REQUIRED_PROVIDERS = ["gdelt", "newsdata", "gnews", "newsapi", "currents", "espn-rss"];

describe("provider policy registry", () => {
  it("has a policy record for every provider named in the brief", () => {
    for (const providerId of REQUIRED_PROVIDERS) {
      expect(getProviderPolicy(providerId)).toBeDefined();
    }
  });

  it("marks only GDELT and NewsData as approved", () => {
    expect(listApprovedProviderIds().sort()).toEqual(["gdelt", "newsdata"]);
  });

  it("marks GNews and NewsAPI as rejected, not merely deferred", () => {
    expect(getProviderPolicy("gnews")?.status).toBe("rejected");
    expect(getProviderPolicy("newsapi")?.status).toBe("rejected");
  });

  it("marks Currents as deferred pending further rights review", () => {
    expect(getProviderPolicy("currents")?.status).toBe("deferred");
  });

  it("marks ESPN RSS as rejected", () => {
    expect(getProviderPolicy("espn-rss")?.status).toBe("rejected");
  });

  it("requires an API key for NewsData but not GDELT", () => {
    expect(getProviderPolicy("gdelt")?.apiKeyRequired).toBe(false);
    expect(getProviderPolicy("newsdata")?.apiKeyRequired).toBe(true);
  });

  it("marks NewsData's freshness as delayed, never claiming real-time parity with GDELT", () => {
    expect(getProviderPolicy("newsdata")?.freshness).toBe("delayed-12h");
    expect(getProviderPolicy("gdelt")?.freshness).not.toBe("delayed-12h");
  });

  it("never allows image display for any provider", () => {
    for (const policy of Object.values(PROVIDER_POLICIES)) {
      expect(policy.imageDisplayAllowed).toBe(false);
    }
  });

  it("never allows full-article storage for any provider", () => {
    for (const policy of Object.values(PROVIDER_POLICIES)) {
      expect(policy.fullArticleStorageAllowed).toBe(false);
    }
  });

  it("defaults every non-approved provider's allowances to the restrictive/false side", () => {
    for (const policy of Object.values(PROVIDER_POLICIES)) {
      if (policy.status !== "approved") {
        expect(policy.headlineDisplayAllowed).toBe(false);
        expect(policy.snippetDisplayAllowed).toBe(false);
        expect(policy.persistentMetadataStorageAllowed).toBe(false);
      }
    }
  });

  it("stamps every policy with the required review date", () => {
    for (const policy of Object.values(PROVIDER_POLICIES)) {
      expect(policy.policyReviewDate).toBe("2026-09-14");
    }
  });
});
