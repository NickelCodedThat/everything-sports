import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { Container } from "@/components/ui/Container";
import { PRIMARY_NAV_ITEMS } from "@/components/navigation/nav-items";

/**
 * Footer per homepage IA item 13. The newsletter block is presented as an
 * honest "coming soon" note rather than a working signup form — there is no
 * backend behind it yet in Phase 1, and a form that submits nowhere would be
 * exactly the kind of dead control the blueprint rules out.
 */
export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container className="grid grid-cols-1 gap-10 py-12 md:grid-cols-12">
        <div className="md:col-span-5">
          <Link href="/" aria-label="Everything Sports home">
            <Wordmark className="text-2xl" />
          </Link>
          <p className="mt-4 max-w-sm text-body text-ink-muted">
            The whole sports conversation, edited with a point of view. Basketball leads, football
            runs close behind, baseball anchors the third pillar, and the rest gets serious
            treatment when the moment earns it.
          </p>
        </div>

        <nav aria-label="Footer sections" className="md:col-span-3">
          <p className="text-meta font-semibold uppercase tracking-wide text-ink-muted">Sections</p>
          <ul className="mt-3 space-y-2">
            {PRIMARY_NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-ui text-ink hover:underline focus-visible:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="md:col-span-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-ink-muted">
            The Morning Wire
          </p>
          <p className="mt-3 max-w-sm text-body text-ink-muted">
            Our daily newsletter is coming soon. Check back once it&rsquo;s live.
          </p>
        </div>
      </Container>

      <div className="border-t border-border py-6">
        <Container>
          <p className="text-meta text-ink-muted">
            &copy; {new Date().getFullYear()} Everything Sports. Demo build — Phase 1.
          </p>
        </Container>
      </div>
    </footer>
  );
}
