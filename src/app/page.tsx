import type { ReactNode } from "react";
import Link from "next/link";
import { fixtureStories } from "@/data/stories";
import { buildHomepage, HOMEPAGE_SECTIONS } from "@/lib/editorial";
import { getStoryPath } from "@/lib/routes";
import type { Story } from "@/types/story";
import { Container } from "@/components/ui/Container";
import { VisuallyHidden } from "@/components/ui/VisuallyHidden";
import {
  AnalysisStory,
  Brief,
  LeadPackage,
  LiveDevelopingStory,
  MajorSplitStory,
  RiverStory,
  SectionHeading,
  VisualFeature,
  WireRail,
} from "@/components/editorial";

/** Picks the editorial card that best fits a story's format for compact list contexts. */
function CompactStory({ story }: { story: Story }) {
  switch (story.storyType) {
    case "live":
      return <LiveDevelopingStory story={story} />;
    case "brief":
      return <Brief story={story} />;
    case "analysis":
    case "opinion":
      return <AnalysisStory story={story} />;
    default:
      return <RiverStory story={story} />;
  }
}

function CompactList({ stories }: { stories: Story[] }) {
  return (
    <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
      {stories.map((story) => (
        <CompactStory key={story.id} story={story} />
      ))}
    </div>
  );
}

function Section({
  id,
  meta,
  children,
}: {
  id: string;
  meta: (typeof HOMEPAGE_SECTIONS)[keyof typeof HOMEPAGE_SECTIONS];
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="border-t border-border py-12 md:py-16"
    >
      <Container>
        <SectionHeading meta={meta} id={id} />
        <div className="mt-6">{children}</div>
      </Container>
    </section>
  );
}

/** Sport package: one alternating-orientation feature story plus a compact mixed-format list. */
function SportPackage({
  stories,
  reverse,
}: {
  stories: Story[];
  reverse?: boolean;
}) {
  const [feature, ...rest] = stories;
  if (!feature) return null;
  return (
    <div className="space-y-10">
      <MajorSplitStory story={feature} reverse={reverse} />
      {rest.length > 0 ? <CompactList stories={rest} /> : null}
    </div>
  );
}

export default function HomePage() {
  const homepage = buildHomepage(fixtureStories);

  return (
    <>
      <h1>
        <VisuallyHidden>
          Everything Sports — the whole sports conversation, edited with a point
          of view
        </VisuallyHidden>
      </h1>

      <section aria-labelledby="section-wire" className="py-6 md:py-8">
        <Container>
          <SectionHeading meta={HOMEPAGE_SECTIONS.WIRE} id="section-wire" />
          <div className="mt-4">
            <WireRail stories={homepage.wire} />
          </div>
        </Container>
      </section>

      {homepage.lead ? (
        <section
          aria-labelledby="section-lead"
          className="border-t border-border py-10 md:py-12"
        >
          <Container>
            <SectionHeading meta={HOMEPAGE_SECTIONS.LEAD} id="section-lead" />
            <div className="mt-6">
              <LeadPackage
                headline={homepage.lead.headline}
                supporting={homepage.lead.supporting}
              />
            </div>
          </Container>
        </section>
      ) : null}

      <Section id="section-now" meta={HOMEPAGE_SECTIONS.NOW}>
        <CompactList stories={homepage.now} />
      </Section>

      {homepage.run.length > 0 ? (
        <Section id="section-run" meta={HOMEPAGE_SECTIONS.RUN}>
          <SportPackage stories={homepage.run} />
        </Section>
      ) : null}

      {homepage.huddle.length > 0 ? (
        <Section id="section-huddle" meta={HOMEPAGE_SECTIONS.HUDDLE}>
          <SportPackage stories={homepage.huddle} reverse />
        </Section>
      ) : null}

      {homepage.cut ? (
        <section
          aria-labelledby="section-cut"
          className="border-t border-border py-12 md:py-16"
        >
          <Container>
            <SectionHeading meta={HOMEPAGE_SECTIONS.CUT} id="section-cut" />
          </Container>
          <div className="mt-6">
            <VisualFeature story={homepage.cut} />
          </div>
        </section>
      ) : null}

      {homepage.diamond.length > 0 ? (
        <Section id="section-diamond" meta={HOMEPAGE_SECTIONS.DIAMOND}>
          <SportPackage stories={homepage.diamond} />
        </Section>
      ) : null}

      {homepage.fightDesk.length > 0 ? (
        <Section id="section-fight-desk" meta={HOMEPAGE_SECTIONS.FIGHT_DESK}>
          <CompactList stories={homepage.fightDesk} />
        </Section>
      ) : null}

      {homepage.worldGame.length > 0 ? (
        <Section id="section-world-game" meta={HOMEPAGE_SECTIONS.WORLD_GAME}>
          <CompactList stories={homepage.worldGame} />
        </Section>
      ) : null}

      {homepage.acrossTheBoard.length > 0 ? (
        <Section
          id="section-across-the-board"
          meta={HOMEPAGE_SECTIONS.ACROSS_THE_BOARD}
        >
          <CompactList stories={homepage.acrossTheBoard} />
        </Section>
      ) : null}

      {homepage.mostRead.length > 0 ? (
        <Section id="section-most-read" meta={HOMEPAGE_SECTIONS.MOST_READ}>
          <ol className="space-y-3">
            {homepage.mostRead.map((story, index) => (
              <li
                key={story.id}
                className="flex gap-4 border-b border-border pb-3 last:border-b-0"
              >
                <span
                  aria-hidden="true"
                  className="font-display text-3xl leading-none text-chalk tabular-nums"
                >
                  {index + 1}
                </span>
                <Link
                  href={getStoryPath(story)}
                  className="font-editorial text-headline-3 font-semibold text-ink hover:underline focus-visible:underline"
                >
                  {story.headline}
                </Link>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
    </>
  );
}
