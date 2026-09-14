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
 * Implementation-safe first pass of the Full Bleed wordmark (blueprint
 * section 3). This is deliberately plain League Gothic typography rather
 * than custom-drawn letterforms — JD has not yet delivered production
 * vectors. Isolated here so the hand-tuned mark can drop in later without a
 * layout refactor.
 */
export function Wordmark({ variant = "horizontal", tone = "ink", className = "" }: WordmarkProps) {
  const textClass = TONE_TEXT[tone];

  if (variant === "stacked") {
    return (
      <span
        className={`font-display uppercase leading-[0.92] tracking-[-0.02em] ${textClass} ${className}`}
      >
        <span className="block text-[1em]">Everything</span>
        <span className="block text-[1em]">Sports</span>
      </span>
    );
  }

  return (
    <span
      className={`font-display uppercase leading-none tracking-[-0.02em] whitespace-nowrap ${textClass} ${className}`}
    >
      Everything Sports
    </span>
  );
}
