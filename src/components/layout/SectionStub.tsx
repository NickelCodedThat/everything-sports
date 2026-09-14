import { Container } from "@/components/ui/Container";
import { RiverStory } from "@/components/editorial";
import type { Story } from "@/types/story";

interface SectionStubProps {
  title: string;
  description: string;
  stories: Story[];
}

/**
 * Lightweight section landing used by the primary nav's non-homepage
 * destinations. Phase 1 scope is the homepage vertical slice — this exists
 * only so top nav links resolve to something real instead of a dead link,
 * per the brief's "lightweight purposeful placeholder routes" allowance.
 */
export function SectionStub({ title, description, stories }: SectionStubProps) {
  return (
    <Container className="py-12 md:py-16">
      <h1 className="font-display text-4xl uppercase tracking-tight text-ink">{title}</h1>
      <p className="mt-2 max-w-2xl text-body-lg text-ink-muted">{description}</p>

      {stories.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-x-8 md:grid-cols-2">
          {stories.map((story) => (
            <RiverStory key={story.id} story={story} />
          ))}
        </div>
      ) : (
        <p className="mt-8 text-body text-ink-muted">No stories yet — check back soon.</p>
      )}
    </Container>
  );
}
