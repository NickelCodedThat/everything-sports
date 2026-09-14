"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ESCutMark, Wordmark } from "@/components/brand";
import { Container } from "@/components/ui/Container";
import { IconButton } from "@/components/ui/IconButton";
import { MenuIcon, SearchIcon } from "@/components/ui/icons";
import { MobileMenu } from "./MobileMenu";
import { MoreMenu } from "./MoreMenu";
import { SearchDialog } from "./SearchDialog";
import { PRIMARY_NAV_ITEMS } from "./nav-items";

/**
 * Masthead and primary navigation (blueprint sections 13-14). Desktop uses
 * two rows: an identity row that scrolls away and a sticky section-nav row
 * carrying the compact mark — which is how the "compact mark replaces the
 * wordmark after scroll" requirement is met without a scroll listener.
 * Mobile is a single sticky 56px row with menu, compact mark, and search.
 */
export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header>
      <div className="sticky top-0 z-sticky h-14 border-b border-border bg-canvas md:hidden">
        <Container className="flex h-full items-center justify-between">
          <IconButton label="Open menu" onClick={() => setMobileMenuOpen(true)}>
            <MenuIcon />
          </IconButton>
          <Link href="/" aria-label="Everything Sports home">
            <ESCutMark tone="ink" size={28} />
          </Link>
          <IconButton label="Open search" onClick={() => setSearchOpen(true)}>
            <SearchIcon />
          </IconButton>
        </Container>
      </div>

      <div className="hidden md:block">
        <Container className="flex h-24 items-center justify-between">
          <Link href="/" aria-label="Everything Sports home">
            <Wordmark className="text-3xl lg:text-4xl" />
          </Link>
          <IconButton label="Open search" onClick={() => setSearchOpen(true)}>
            <SearchIcon />
          </IconButton>
        </Container>

        <div className="sticky top-0 z-sticky border-b border-border bg-canvas">
          <Container className="flex h-14 items-center gap-6">
            <Link href="/" aria-label="Everything Sports home" className="mr-2 shrink-0">
              <ESCutMark tone="ink" size={22} />
            </Link>
            <nav aria-label="Primary">
              <ul className="flex items-center gap-6">
                {PRIMARY_NAV_ITEMS.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={`inline-flex min-h-11 items-center border-b-2 text-ui font-semibold transition-colors duration-[var(--duration-fast)] ${
                          isActive
                            ? "border-brand text-ink"
                            : "border-transparent text-ink-muted hover:text-ink"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="ml-auto">
              <MoreMenu />
            </div>
          </Container>
        </div>
      </div>

      <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} activeHref={pathname} />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
