import type { SectionMeta } from "@/lib/editorial";

/**
 * Section title per blueprint section 11: editorial names stay clear
 * through a visible secondary plain-language label, not just an accessible
 * name. `id` lets the parent <section> use aria-labelledby.
 */
export function SectionHeading({ meta, id }: { meta: SectionMeta; id: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 id={id} className="font-display text-3xl uppercase tracking-tight text-ink">
        {meta.title}
      </h2>
      <span className="text-meta font-semibold uppercase tracking-wide text-ink-muted">
        {meta.plainLabel}
      </span>
    </div>
  );
}
