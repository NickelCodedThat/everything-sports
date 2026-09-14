import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";

export const metadata: Metadata = { title: "Search" };

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

/**
 * Honest placeholder: Phase 1 has no search index behind this route yet
 * (see blueprint section 18 for the full future search UX). Acknowledging
 * the query instead of faking results avoids a dead-feeling control.
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;

  return (
    <Container className="py-12 md:py-16">
      <h1 className="font-display text-4xl uppercase tracking-tight text-ink">
        Search
      </h1>
      <p className="mt-2 max-w-2xl text-body-lg text-ink-muted">
        {q
          ? `Search for “${q}” is not available in this preview. Browse the latest stories or choose a sport from the navigation.`
          : "Search is being prepared for launch. Browse the latest stories or choose a sport from the navigation."}
      </p>
    </Container>
  );
}
