import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  getDjLinksForDjs,
  getEventById,
  getEventBySlug,
  getEventLineup,
  getEventSets,
  getVenues,
} from "@/lib/queries";
import { displayLabel, linkDomain, prioritiseEventLinks } from "@/lib/link-labels";
import type { EventSetRow, LinkRow } from "@/lib/repo/types";

export const dynamic = "force-dynamic";

// Set times are printed in NZ local time on the poster, so render them in
// Pacific/Auckland regardless of where the server runs.
const nzTimeFormatter = new Intl.DateTimeFormat("en-NZ", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Pacific/Auckland",
});

function formatSetTime(value: string | null): string {
  return value ? nzTimeFormatter.format(new Date(value)) : "tbc";
}

interface SetSlot {
  key: string;
  label: string;
  startsAt: string | null;
  endsAt: string | null;
  djs: EventSetRow[];
}

/** Group a stage's timetable rows into slots: a b2b bill shares one slot. */
function groupSetsByStage(sets: EventSetRow[]): Array<[string, SetSlot[]]> {
  const stages = new Map<string, Map<string, SetSlot>>();
  for (const set of sets) {
    const stage = set.stage ?? "Stage tbc";
    const label = set.act_label ?? set.dj_name;
    const key = `${set.starts_at ?? ""}|${set.ends_at ?? ""}|${label}`;
    const slots = stages.get(stage) ?? new Map<string, SetSlot>();
    const slot = slots.get(key) ?? {
      key,
      label,
      startsAt: set.starts_at,
      endsAt: set.ends_at,
      djs: [],
    };
    slot.djs.push(set);
    slots.set(key, slot);
    stages.set(stage, slots);
  }
  return [...stages.entries()].map(([stage, slots]) => [stage, [...slots.values()]]);
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Slugs are the canonical URL. The scraper id still resolves, and sends the
  // visitor on to the slug so old links and search results keep working (#339).
  const event = (await getEventBySlug(slug)) ?? (await getEventById(slug));
  if (!event) notFound();
  if (event.slug && event.slug !== slug) permanentRedirect(`/events/${event.slug}`);

  const [lineup, sets, venues] = await Promise.all([
    getEventLineup(event.id),
    getEventSets(event.id),
    getVenues(),
  ]);
  const timetable = groupSetsByStage(sets);

  // One read for the whole lineup (#340), then group it so each card can show
  // the artist's own SoundCloud, Instagram and the rest without leaving a gig.
  const linksByDj = new Map<string, LinkRow[]>();
  for (const link of await getDjLinksForDjs(lineup.map((dj) => dj.id))) {
    const list = linksByDj.get(link.dj_id) ?? [];
    list.push(link);
    linksByDj.set(link.dj_id, list);
  }

  const venue = event.venue
    ? venues.find((candidate) => candidate.name.toLowerCase() === event.venue!.toLowerCase())
    : undefined;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/events" className="font-mono text-xs text-muted hover:text-accent">
        ← event calendar
      </Link>
      <h1 className="mt-4 text-3xl font-black text-foreground">{event.name}</h1>
      <p className="mt-2 font-mono text-xs text-muted">
        {event.starts_at
          ? new Date(event.starts_at).toLocaleDateString("en-NZ", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : "date tbc"}
        {event.starts_at ? ` · ${formatSetTime(event.starts_at)}` : ""}
      </p>
      <p className="mt-1 font-mono text-xs text-muted">
        {venue ? (
          <Link
            href={`/venues/${venue.id}`}
            className="text-accent transition-colors hover:underline"
          >
            {event.venue}
          </Link>
        ) : (
          (event.venue ?? "venue tbc")
        )}
        {event.region ? ` · ${event.region}` : ""}
      </p>
      {event.url && (
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block rounded-full border border-edge px-4 py-2 font-mono text-xs text-foreground transition-colors hover:border-accent hover:text-accent"
        >
          tickets / source ↗
        </a>
      )}
      {event.archive_url && (
        <a
          href={event.archive_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 ml-2 inline-block rounded-full border border-dashed border-edge px-4 py-2 font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
        >
          archived copy ↗
        </a>
      )}

      {timetable.length > 0 && (
        <>
          <h2 className="mt-10 text-xl font-bold text-foreground">Set times</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {timetable.map(([stage, slots]) => (
              <section key={stage} className="rounded-lg border border-edge bg-surface p-4">
                <h3 className="font-mono text-xs uppercase tracking-wider text-accent">{stage}</h3>
                <ul className="mt-3 space-y-2">
                  {slots.map((slot) => {
                    // Only DJs we hold a public profile for are named and
                    // linked; the slot label already carries the full billing.
                    const listedMembers = slot.djs.filter((set) => set.dj_listed);
                    return (
                      <li key={slot.key} className="flex gap-3">
                        <span className="w-28 shrink-0 font-mono text-xs text-muted">
                          {formatSetTime(slot.startsAt)} – {formatSetTime(slot.endsAt)}
                        </span>
                        <span className="text-sm text-foreground">
                          {slot.djs.length === 1 && slot.djs[0].dj_listed ? (
                            <Link
                              href={`/djs/${slot.djs[0].dj_id}`}
                              className="text-accent hover:underline"
                            >
                              {slot.label}
                            </Link>
                          ) : (
                            <>
                              {slot.label}
                              {listedMembers.length > 0 && (
                                <span className="mt-1 block font-mono text-xs text-muted">
                                  {listedMembers.map((set, index) => (
                                    <span key={set.dj_id}>
                                      {index > 0 && " · "}
                                      <Link
                                        href={`/djs/${set.dj_id}`}
                                        className="text-accent hover:underline"
                                      >
                                        {set.dj_name}
                                      </Link>
                                    </span>
                                  ))}
                                </span>
                              )}
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      <h2 className="mt-10 text-xl font-bold text-foreground">Lineup</h2>
      {lineup.length === 0 ? (
        <p className="mt-3 font-mono text-sm text-muted">No DJs mapped to this event yet.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {lineup.map((dj) => {
            // The card is capped at five pills, so put the artist's music and
            // socials first and skip the pill that points back at this event.
            const djLinks = prioritiseEventLinks(
              (linksByDj.get(dj.id) ?? []).filter((link) => link.url !== event.url)
            ).slice(0, 5);
            return (
              <div
                key={dj.id}
                className="rounded-lg border border-edge bg-surface p-4 transition-colors hover:border-accent/60"
              >
                <Link
                  href={`/djs/${dj.id}`}
                  className="text-sm font-semibold text-foreground hover:text-accent"
                >
                  {dj.name}
                </Link>
                <p className="mt-1 font-mono text-xs text-muted">
                  {dj.genres.slice(0, 4).join(" / ") || "genre tbc"}
                </p>
                {djLinks.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                    {djLinks.map((link) => (
                      <li key={link.id}>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-6 items-center font-mono text-xs text-accent hover:underline"
                        >
                          {displayLabel(link.type, link.label)} ↗
                          <span className="sr-only">
                            {" "}
                            ({linkDomain(link.url)}, opens in a new tab)
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {event.dj_id && (
        <p className="mt-8 font-mono text-xs text-muted">
          Headliner:{" "}
          <Link href={`/djs/${event.dj_id}`} className="text-accent hover:underline">
            {event.dj_name}
          </Link>
        </p>
      )}

      <details className="mt-10 rounded-lg border border-edge">
        <summary className="cursor-pointer px-4 py-3 font-mono text-xs uppercase tracking-wider text-muted transition-colors hover:text-accent">
          Sources
        </summary>
        <div className="border-t border-edge px-4 py-3 font-mono text-xs text-muted">
          <p>Source: {event.source}</p>
          {event.url && <p className="mt-1">Listing: {event.url}</p>}
          {event.archive_url && (
            <p className="mt-1">
              Archived:{" "}
              <a
                href={event.archive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-faint hover:text-accent"
              >
                {event.archive_url}
              </a>
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
