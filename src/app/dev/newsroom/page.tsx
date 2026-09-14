import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fetchNewsCandidates } from "@/lib/news/newsroom";
import {
  ALL_CANDIDATE_PROVIDERS,
  APPROVED_CANDIDATE_PROVIDERS,
  getCandidateProviderById,
} from "@/lib/news/providers";
import type { CandidateProvider } from "@/lib/news/providers/types";
import type { Sport } from "@/types/sport";
import { QUERYABLE_SPORTS } from "@/lib/news/queries/sport-profiles";

export const metadata: Metadata = {
  title: "Newsroom preview (dev only)",
  robots: { index: false, follow: false },
};

interface DevNewsroomPageProps {
  searchParams: Promise<{ provider?: string; sport?: string; window?: string; limit?: string }>;
}

function resolveProviders(providerParam: string | undefined): CandidateProvider[] {
  if (!providerParam || providerParam === "local") {
    const local = getCandidateProviderById("local");
    return local ? [local] : [];
  }
  if (providerParam === "all") return APPROVED_CANDIDATE_PROVIDERS;
  const provider = getCandidateProviderById(providerParam);
  return provider ? [provider] : [];
}

function resolveSport(sportParam: string | undefined): Sport | "all" {
  if (sportParam === "all" || !sportParam) return "all";
  return QUERYABLE_SPORTS.includes(sportParam as Sport) ? (sportParam as Sport) : "all";
}

/**
 * Development-only newsroom inspection page — NOT part of the public
 * product. Guarded so it can never render outside `next dev`; `next
 * build`/`next start` always set NODE_ENV=production, so this 404s there
 * regardless of any other configuration. No nav link points here, no SEO.
 * Defaults to the offline local provider so loading this page never blocks
 * on a live network call or GDELT's rate limit; pass ?provider=gdelt (etc)
 * to run a real fetch, same shape as `pnpm news:probe`.
 */
export default async function DevNewsroomPage({ searchParams }: DevNewsroomPageProps) {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const params = await searchParams;
  const providerParam = params.provider ?? "local";
  const providers = resolveProviders(providerParam);
  const sport = resolveSport(params.sport);
  const window = params.window ?? "3h";
  const limit = Number(params.limit) > 0 ? Number(params.limit) : 25;

  const result =
    providers.length > 0
      ? await fetchNewsCandidates({ providers, sport, window, limit })
      : { candidates: [], providerResults: [], summary: { totalCandidates: 0, bySport: {}, duplicates: 0 } };

  return (
    <div style={{ fontFamily: "monospace", padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <p style={{ background: "#B42318", color: "#fff", padding: "8px 12px", fontWeight: 700 }}>
        DEVELOPMENT ONLY — newsroom candidate preview. Not part of the public product. Never linked
        from navigation. Diagnostic metadata only — headlines and links may be shown; images are
        never rendered (diagnostic references only).
      </p>

      <h1 style={{ fontSize: 20, marginTop: 16 }}>Everything Sports newsroom preview</h1>
      <p>
        provider={providerParam} · sport={sport} · window={window} · limit={limit} ·{" "}
        known providers: {ALL_CANDIDATE_PROVIDERS.map((provider) => provider.id).join(", ")}
      </p>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Provider results</h2>
      <ul>
        {result.providerResults.map((providerResult) => (
          <li key={providerResult.providerId}>
            {providerResult.providerId}: {providerResult.status} — {providerResult.candidates.length}{" "}
            candidates{providerResult.message ? ` (${providerResult.message})` : ""} [{providerResult.durationMs}ms]
          </li>
        ))}
      </ul>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>
        Candidates ({result.summary.totalCandidates}, {result.summary.duplicates} duplicate-URL)
      </h2>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead>
          <tr>
            {["Provider", "Sport", "Confidence", "Publisher", "Published", "Headline", "Source URL", "Dup?"].map(
              (heading) => (
                <th key={heading} style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 8px" }}>
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {result.candidates.map((candidate) => (
            <tr key={candidate.id}>
              <td style={{ padding: "4px 8px", borderBottom: "1px solid #eee" }}>{candidate.provider}</td>
              <td style={{ padding: "4px 8px", borderBottom: "1px solid #eee" }}>{candidate.classification.sport}</td>
              <td style={{ padding: "4px 8px", borderBottom: "1px solid #eee" }}>{candidate.classification.confidence}</td>
              <td style={{ padding: "4px 8px", borderBottom: "1px solid #eee" }}>
                {candidate.publisherName ?? candidate.publisherDomain}
              </td>
              <td style={{ padding: "4px 8px", borderBottom: "1px solid #eee" }}>{candidate.publishedAt ?? "—"}</td>
              <td style={{ padding: "4px 8px", borderBottom: "1px solid #eee" }}>{candidate.headline}</td>
              <td style={{ padding: "4px 8px", borderBottom: "1px solid #eee", wordBreak: "break-all" }}>
                <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {candidate.sourceUrl}
                </a>
              </td>
              <td style={{ padding: "4px 8px", borderBottom: "1px solid #eee" }}>
                {candidate.isDuplicateUrl ? "duplicate URL candidate" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
