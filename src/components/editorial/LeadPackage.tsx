import Link from "next/link";
import type { Story } from "@/types/story";
import { getStoryPath } from "@/lib/routes";
import { StoryImage } from "./StoryImage";
import { StoryMeta } from "./StoryMeta";
import { ContentTypeTag, UrgencyTag } from "@/components/ui/Tag";

interface LeadPackageProps {
  headline: Story;
  supporting?: Story[];
}

/**
 * The Lead: one dominant package, up to two supporting stories (blueprint
 * section 10.A). Mobile stacks image → labels → headline → deck → meta →
 * related links; desktop uses an asymmetric 7/5 split.
 */
export function LeadPackage({ headline, supporting = [] }: LeadPackageProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-8">
      {headline.image ? (
        // md:h-full: the grid row stretches to the taller (text) column by default,
        // so the image fills that height instead of leaving dead space under a
        // fixed-ratio crop — see the height precedence note on StoryImage.
        <Link href={getStoryPath(headline)} className="block md:col-span-7 md:h-full">
          <StoryImage
            image={headline.image}
            aspectRatio="4/5"
            priority
            sizes="(min-width: 768px) 58vw, 100vw"
            className="md:h-full"
          />
        </Link>
      ) : (
        <div className="md:col-span-7" />
      )}

      <div className="md:col-span-5">
        <div className="flex flex-wrap items-center gap-2">
          {headline.urgency !== "none" ? <UrgencyTag urgency={headline.urgency} /> : null}
          <ContentTypeTag storyType={headline.storyType} />
        </div>

        <h3 className="mt-3 font-editorial text-headline-1 font-bold text-ink">
          <Link href={getStoryPath(headline)} className="hover:underline focus-visible:underline">
            {headline.headline}
          </Link>
        </h3>

        <p className="mt-3 font-editorial text-body-lg text-ink-muted">{headline.deck}</p>

        <StoryMeta story={headline} className="mt-4" />

        {supporting.length > 0 ? (
          <ul className="mt-6 space-y-3 border-t border-border pt-4">
            {supporting.map((story) => (
              <li key={story.id}>
                <Link
                  href={getStoryPath(story)}
                  className="font-editorial text-headline-3 font-semibold text-ink hover:underline focus-visible:underline"
                >
                  {story.headline}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
