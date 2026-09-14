export type BrandTone = "ink" | "reversed" | "brand";

const TONE_TEXT: Record<BrandTone, string> = {
  ink: "text-ink",
  reversed: "text-clean-sheet",
  brand: "text-brand",
};

interface WordmarkProps {
  /** Horizontal is the primary lockup; stacked is for narrow placements. */
  variant?: "horizontal" | "stacked";
  tone?: BrandTone;
  className?: string;
}

/**
 * Full Bleed web wordmark. The coral splice is a compact edit/broadcast cue
 * shared by every lockup, giving the typeset stage-two identity a repeatable
 * signature without pretending it is the final custom-drawn trademark.
 */
export function Wordmark({
  variant = "horizontal",
  tone = "ink",
  className = "",
}: WordmarkProps) {
  const textClass = TONE_TEXT[tone];

  if (variant === "stacked") {
    return (
      <span
        className={`inline-flex flex-col font-display uppercase leading-[0.84] tracking-[-0.02em] ${textClass} ${className}`}
      >
        <span className="block text-[1em]">Everything</span>
        <span className="mt-[0.1em] inline-flex items-center text-[1em]">
          <span
            aria-hidden="true"
            className="mr-[0.13em] h-[0.62em] w-[0.1em] bg-brand"
          />
          Sports
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap font-display uppercase leading-none tracking-[-0.02em] ${textClass} ${className}`}
    >
      <span>Everything</span>
      <span
        aria-hidden="true"
        className="mx-[0.13em] h-[0.64em] w-[0.09em] bg-brand"
      />
      <span>Sports</span>
    </span>
  );
}
