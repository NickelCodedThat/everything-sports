import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fixtureStories } from "@/data/stories";
import { getSectionHref } from "@/lib/routes";
import type { Sport } from "@/types/sport";
import type { Story } from "@/types/story";
import { Container } from "@/components/ui/Container";
import { ExternalButtonLink } from "@/components/ui/Button";
import { ContentTypeTag, UrgencyTag } from "@/components/ui/Tag";
import { StoryImage, StoryMeta } from "@/components/editorial";

interface StoryPageProps {
  params: Promise<{ sport: string; slug: string }>;
}

const SPORT_LABEL: Record<Sport, string> = {
  basketball: "Basketball",
  football: "Football",
  baseball: "Baseball",
  boxing: "Boxing",
  mma: "MMA",
  soccer: "Soccer",
  hockey: "Hockey",
  tennis: "Tennis",
  golf: "Golf",
  motorsports: "Motorsports",
  olympics: "Olympics",
  other: "Culture",
};

function isSport(value: string): value is Sport {
  return Object.hasOwn(SPORT_LABEL, value);
}

function findStory(sport: string, slug: string): Story | undefined {
  if (!isSport(sport)) return undefined;
  return fixtureStories.find(
    (story) => story.sport === sport && story.slug === slug,
  );
}

/**
 * Prerenders every fixture story at build time, matching the rest of the
 * site being fully static. Params outside this set still resolve on demand
 * (and 404 via `findStory` below) rather than failing outright.
 */
export function generateStaticParams() {
  return fixtureStories.map((story) => ({
    sport: story.sport,
    slug: story.slug,
  }));
}

export async function generateMetadata({
  params,
}: StoryPageProps): Promise<Metadata> {
  const { sport, slug } = await params;
  const story = findStory(sport, slug);
  if (!story) return { title: "Story not found" };
  return { title: story.headline, description: story.deck };
}

/**
 * Lightweight Phase 1 story shell — not the future full article/story-cluster
 * experience (blueprint section 17). Exists so every homepage story link
 * resolves to a real, polished destination instead of 404ing. Original
 * Everything Sports stories get an honest "full article coming later" note
 * rather than a fabricated body; aggregated stories get a clear outbound
 * action to the actual source, using `story.sourceUrl` — never confused with
 * this page's own canonical route.
 */
export default async function StoryPage({ params }: StoryPageProps) {
  const { sport, slug } = await params;
  const story = findStory(sport, slug);
  if (!story) notFound();

  return (
    <article>
      <Container className="max-w-3xl py-10 md:py-16">
        <Link
          href={getSectionHref(story.sport)}
          className="text-meta font-semibold uppercase tracking-wide text-ink-muted hover:text-ink"
        >
          ← {SPORT_LABEL[story.sport]}
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {story.urgency !== "none" ? (
            <UrgencyTag urgency={story.urgency} />
          ) : null}
          <ContentTypeTag storyType={story.storyType} />
        </div>

        <h1 className="mt-3 font-editorial text-headline-1 font-bold text-ink">
          {story.headline}
        </h1>
        <p className="mt-4 font-editorial text-body-lg text-ink-muted">
          {story.deck}
        </p>
        <StoryMeta story={story} className="mt-4" />

        {story.image ? (
          <StoryImage
            image={story.image}
            aspectRatio="3/2"
            priority
            showCredit
            sizes="(min-width: 768px) 720px, 100vw"
            className="mt-8"
          />
        ) : null}

        <div className="mt-8 border-t-2 border-ink pt-6">
          {story.originality === "aggregated" ? (
            <>
              <p className="text-meta font-bold uppercase tracking-wide text-ink">
                Reporting from {story.source.name}
              </p>
              <p className="mt-2 max-w-xl text-body text-ink-muted">
                This reporting originated at {story.source.name}, not Everything
                Sports. Continue to the publisher for the complete story.
              </p>
              <ExternalButtonLink href={story.sourceUrl} className="mt-4">
                Read the full story at {story.source.name}
                <span aria-hidden="true" className="ml-2">
                  ↗
                </span>
                <span className="sr-only"> (opens in a new tab)</span>
              </ExternalButtonLink>
            </>
          ) : (
            <>
              <p className="text-meta font-bold uppercase tracking-wide text-ink">
                Story preview
              </p>
              <p className="mt-2 max-w-xl font-editorial text-body text-ink-muted">
                This is an Everything Sports original. Full reporting is not
                available in this preview.
              </p>
            </>
          )}
        </div>
      </Container>
    </article>
  );
}
