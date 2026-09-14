import type { StoryType, StoryUrgency } from "@/types/story";

const URGENCY_LABEL: Record<Exclude<StoryUrgency, "none">, string> = {
  breaking: "Breaking",
  developing: "Developing",
};

const CONTENT_TYPE_LABEL: Partial<Record<StoryType, string>> = {
  analysis: "Analysis",
  opinion: "Opinion",
  brief: "Brief",
  "visual-feature": "Feature",
  live: "Live",
};

/**
 * Urgency badge per blueprint section 15: Burnt Signal field, white text.
 * A card shows at most one of these, per section 9's "one urgency badge" rule.
 */
export function UrgencyTag({ urgency }: { urgency: Exclude<StoryUrgency, "none"> }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-brand px-2 py-0.5 text-micro font-bold uppercase tracking-wide text-clean-sheet">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-clean-sheet" aria-hidden="true" />
      {URGENCY_LABEL[urgency]}
    </span>
  );
}

/**
 * Content-format label per blueprint section 9: text only, no decorative
 * field — a card shows at most one alongside its urgency badge.
 */
export function ContentTypeTag({
  storyType,
  tone = "default",
}: {
  storyType: StoryType;
  /** "reversed" for use over photography or Blacktop surfaces. */
  tone?: "default" | "reversed";
}) {
  const label = CONTENT_TYPE_LABEL[storyType];
  if (!label) return null;
  const textClass = tone === "reversed" ? "text-chalk" : "text-ink-muted";
  return <span className={`text-micro font-bold uppercase tracking-wide ${textClass}`}>{label}</span>;
}
