"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Search entry point per blueprint section 18. Phase 1 has no search index
 * behind this yet, so it submits to /search rather than faking typeahead
 * results — an honest "coming soon" beats a control that pretends to work.
 * Autofocus only fires from this explicit open action, never on page load.
 */
export function SearchDialog({ open, onClose }: SearchDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    router.push(`/search?q=${encodeURIComponent(value)}`);
    onClose();
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      className="fixed inset-0 z-modal bg-canvas"
    >
      <div className="border-b-2 border-brand bg-blacktop">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-3 px-[var(--gutter)]">
          <form
            onSubmit={handleSubmit}
            className="flex flex-1 items-center gap-3"
          >
            <label htmlFor="site-search" className="sr-only">
              Search Everything Sports
            </label>
            <input
              ref={inputRef}
              id="site-search"
              name="q"
              type="search"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Search stories and teams"
              className="h-12 min-w-0 flex-1 border-b-2 border-clean-sheet/55 bg-transparent font-editorial text-headline-3 text-clean-sheet placeholder:text-clean-sheet/70 focus:border-clean-sheet focus:outline-none"
            />
            {value ? (
              <IconButton
                tone="reversed"
                label="Clear search"
                type="button"
                onClick={() => setValue("")}
              >
                <CloseIcon />
              </IconButton>
            ) : null}
            <IconButton tone="reversed" label="Submit search" type="submit">
              <SearchIcon />
            </IconButton>
          </form>
          <IconButton tone="reversed" label="Close search" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[90rem] px-[var(--gutter)] py-10 md:py-16">
        <p className="max-w-3xl font-display text-display-2 uppercase text-ink">
          Find the story behind the moment.
        </p>
        <p className="mt-3 max-w-xl text-body-lg text-ink-muted">
          Search teams, athletes, leagues, and the stories shaping the day.
        </p>
      </div>
    </div>
  );
}
