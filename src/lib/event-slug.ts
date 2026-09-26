// Event URLs name the gig and the year: /events/2026-carlucci-carnival. The
// scraper ids (ra-2468041, eventfinda-sitemap-a4f1af6ca182) stay valid as
// redirect sources so links already in the wild keep working (#339).

const NZ_TIME_ZONE = "Pacific/Auckland";

/** Lower-case, hyphenated form of a name: "Carlucci Carnival" → "carlucci-carnival". */
export function slugifyEventName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      // Drop the combining marks NFKD splits out, so "Röyksopp" is "royksopp".
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * The year a gig is on, in the venue's timezone. A 9pm Auckland gig is
 * 2026-09-26T09:00Z, so reading the UTC year would put New Year's Eve shows
 * in the wrong year.
 */
export function eventYear(startsAt: string | null | undefined): string | null {
  if (!startsAt) return null;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-NZ", {
    year: "numeric",
    timeZone: NZ_TIME_ZONE,
  }).formatToParts(date);
  return parts.find((part) => part.type === "year")?.value ?? null;
}

/** Slug for an event URL, or null when the row has no name or date yet. */
export function eventSlug(
  name: string | null | undefined,
  startsAt: string | null | undefined
): string | null {
  const year = eventYear(startsAt);
  const nameSlug = name ? slugifyEventName(name) : "";
  if (!year || !nameSlug) return null;
  return `${year}-${nameSlug}`;
}

/**
 * First free slug: the base, then "-2", "-3" and so on. Two gigs called the
 * same thing in the same year must not overwrite each other.
 */
export function uniqueEventSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
