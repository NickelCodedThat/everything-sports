"use client";

import { useRef } from "react";
import Link from "next/link";
import type { Story } from "@/types/story";
import { Timestamp } from "@/components/ui/Timestamp";
import { IconButton } from "@/components/ui/IconButton";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";

/**
 * The Wire: a horizontally scrollable rail with a visible partial next item
 * and pointer prev/next buttons, per blueprint section 12. The native
 * scrollbar is left visible rather than hidden so scroll position stays
 * exposed, and nothing auto-advances.
 */
export function WireRail({ stories }: { stories: Story[] }) {
  const scrollerRef = useRef<HTMLUListElement>(null);

  function scrollByAmount(amount: number) {
    scrollerRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <ul ref={scrollerRef} className="flex snap-x gap-4 overflow-x-auto pb-3">
        {stories.map((story) => (
          <li
            key={story.id}
            className="w-[260px] shrink-0 snap-start border-l-2 border-brand pl-3"
          >
            <Link href={story.sourceUrl} className="block hover:underline focus-visible:underline">
              <span className="text-micro font-bold uppercase tracking-wide text-brand">
                {story.urgency === "breaking" ? "Breaking" : "Developing"}
              </span>
              <p className="mt-1 line-clamp-3 text-ui font-semibold text-ink">{story.headline}</p>
              <Timestamp
                iso={story.updatedAt ?? story.publishedAt}
                className="mt-1 block text-meta font-semibold text-ink-muted"
              />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-1 hidden justify-end gap-2 md:flex">
        <IconButton label="Scroll The Wire left" onClick={() => scrollByAmount(-280)}>
          <ChevronLeftIcon />
        </IconButton>
        <IconButton label="Scroll The Wire right" onClick={() => scrollByAmount(280)}>
          <ChevronRightIcon />
        </IconButton>
      </div>
    </div>
  );
}
