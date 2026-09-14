export interface NavItem {
  label: string;
  href: string;
}

/** Primary desktop nav order per blueprint section 14. */
export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { label: "Latest", href: "/latest" },
  { label: "Basketball", href: "/basketball" },
  { label: "Football", href: "/football" },
  { label: "Baseball", href: "/baseball" },
  { label: "Fight", href: "/fight" },
  { label: "Soccer", href: "/soccer" },
];

/** Sports covered under "More" that don't yet have a dedicated section page (blueprint: standard coverage tier). */
export const MORE_SPORTS = ["Hockey", "Tennis", "Golf", "Motorsports", "Olympics"];
