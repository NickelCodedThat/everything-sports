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
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    router.push(`/search?q=${encodeURIComponent(value)}`);
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Search" className="fixed inset-0 z-modal bg-canvas">
      <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-3 px-[var(--gutter)]">
        <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-3">
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
            placeholder="Search teams, players, topics"
            className="h-12 flex-1 border-b-2 border-ink bg-transparent font-editorial text-headline-3 text-ink placeholder:text-ink-muted focus:outline-none"
          />
          {value ? (
            <IconButton label="Clear search" type="button" onClick={() => setValue("")}>
              <CloseIcon />
            </IconButton>
          ) : null}
          <IconButton label="Submit search" type="submit">
            <SearchIcon />
          </IconButton>
        </form>
        <IconButton label="Close search" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>
    </div>
  );
}
