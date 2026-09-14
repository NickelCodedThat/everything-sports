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
 * section 10.A). Mobile and tablet stack the package for a clear reading
 * order; wide desktop uses an asymmetric 7/5 split.
 */
export function LeadPackage({ headline, supporting = [] }: LeadPackageProps) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 xl:items-start xl:gap-8">
      {headline.image ? (
        <Link href={getStoryPath(headline)} className="block xl:col-span-7">
          <StoryImage
            image={headline.image}
            aspectRatio="1/1"
            priority
            sizes="(min-width: 1280px) 58vw, 100vw"
            className="lead-story-image"
          />
        </Link>
      ) : (
        <div className="xl:col-span-7" />
      )}

      <div className="xl:col-span-5">
        <div className="flex flex-wrap items-center gap-2">
          {headline.urgency !== "none" ? (
            <UrgencyTag urgency={headline.urgency} />
          ) : null}
          <ContentTypeTag storyType={headline.storyType} />
        </div>

        <h3 className="mt-3 font-editorial text-headline-1 font-bold text-ink">
          <Link
            href={getStoryPath(headline)}
            className="hover:underline focus-visible:underline"
          >
            {headline.headline}
          </Link>
        </h3>

        <p className="mt-3 font-editorial text-body-lg text-ink-muted">
          {headline.deck}
        </p>

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
