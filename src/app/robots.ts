import type { MetadataRoute } from "next";

/** Blocks crawling while the site is a Phase 1 demo build with no production domain yet. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
