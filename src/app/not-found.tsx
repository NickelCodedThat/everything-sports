import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <Container className="py-20 text-center md:py-32">
      <h1 className="font-display text-6xl uppercase tracking-tight text-ink">Page not found</h1>
      <p className="mx-auto mt-3 max-w-md text-body-lg text-ink-muted">
        That story or section doesn&rsquo;t exist yet. Head back to the front page.
      </p>
      <ButtonLink href="/" className="mt-6">
        Back to the front page
      </ButtonLink>
    </Container>
  );
}
