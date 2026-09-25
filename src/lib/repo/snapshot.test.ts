import { describe, expect, it, vi } from "vitest";

const { fixture } = vi.hoisted(() => ({
  fixture: {
    djs: [
      {
        id: "paige-julia",
        name: "Paige Julia",
        bio: "Wellington drum and bass DJ.",
        genres: ["Drum & Bass", "Jungle"],
        image_url: null,
        soundcloud_url: null,
        instagram_url: null,
        facebook_url: null,
        mixcloud_url: null,
        website_url: null,
        active: true,
        popularity: 10,
        data_completeness: 40,
        verification_level: 2,
        verification_sources: ["location"],
        source: "test",
        is_nz: true,
        upcoming_events: 1,
        last_played_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "retired-dj",
        name: "Retired DJ",
        bio: null,
        genres: ["House"],
        image_url: null,
        soundcloud_url: null,
        instagram_url: null,
        facebook_url: null,
        mixcloud_url: null,
        website_url: null,
        active: false,
        popularity: 99,
        data_completeness: 90,
        verification_level: 1,
        verification_sources: [],
        source: "test",
        is_nz: true,
        upcoming_events: 0,
        last_played_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    events: [
      {
        id: "ra-2468041",
        name: "Carlucci Carnival 2026",
        venue: "Carlucci Land",
        starts_at: "2030-09-26T15:00:00+12:00",
        is_dj_event: true,
        dj_id: "paige-julia",
      },
      {
        id: "past-night",
        name: "Past Night",
        venue: "Carlucci Land",
        starts_at: "2020-01-01T21:00:00+13:00",
        is_dj_event: true,
        dj_id: "paige-julia",
      },
      {
        id: "ra-billing",
        name: "Manakin b2b J.A.P.R",
        venue: "San Fran",
        starts_at: "2030-10-01T22:00:00+13:00",
        is_dj_event: true,
        dj_id: "paige-julia",
      },
      {
        id: "ra-label-night",
        name: "Sunshine Records presents Night",
        venue: "San Fran",
        starts_at: "2030-10-02T22:00:00+13:00",
        is_dj_event: true,
        dj_id: "paige-julia",
      },
    ],
    mixes: [
      {
        id: "mix-live",
        dj_id: "paige-julia",
        title: "Live set",
        url: "https://example.com/live",
        platform: "soundcloud",
        status: "live",
      },
      {
        id: "mix-dead",
        dj_id: "paige-julia",
        title: "Deleted set",
        url: "https://example.com/dead",
        platform: "soundcloud",
        status: "dead",
      },
    ],
    links: [
      {
        id: "link-live",
        dj_id: "paige-julia",
        type: "soundcloud",
        url: "https://soundcloud.com/paige-julia",
        status: "live",
      },
      {
        id: "link-dead",
        dj_id: "paige-julia",
        type: "instagram",
        url: "https://instagram.com/gone",
        status: "dead",
      },
    ],
    eventDjs: [
      {
        event_id: "ra-2468041",
        dj_id: "paige-julia",
        stage: "Steel Circus",
        starts_at: "2030-09-26T21:30:00+12:00",
        ends_at: "2030-09-26T23:00:00+12:00",
        act_label: "Paige Julia",
      },
      {
        event_id: "ra-2468041",
        dj_id: "unlisted-dj",
        stage: "Steel Circus",
        starts_at: "2030-09-26T21:30:00+12:00",
        ends_at: "2030-09-26T23:00:00+12:00",
        act_label: "Manakin b2b J.A.P.R",
      },
      { event_id: "ra-2468041", dj_id: "paige-julia", act_label: null },
      { event_id: "past-night", dj_id: "paige-julia" },
    ],
    venues: [
      { id: "carlucci-land", name: "Carlucci Land" },
      { id: "san-fran", name: "San Fran" },
    ],
    orgs: [{ id: "rhythm-output", name: "Rhythm Output" }],
    soundsystems: [{ id: "sound-system", name: "The Rig" }],
    releases: [
      {
        id: "rel-1",
        dj_id: "paige-julia",
        title: "First Light",
        year: 2026,
        label: "Sunshine Records",
        format: '12"',
      },
    ],
    articles: [
      {
        id: "art-1",
        dj_id: "paige-julia",
        title: "Meet Paige Julia",
        url: "https://example.com/a",
        source: "example",
      },
    ],
  },
}));

vi.mock("@/data/snapshot.json", () => ({ default: fixture }));

import { SnapshotRepo } from "./snapshot";

const repo = new SnapshotRepo();

describe("SnapshotRepo link and mix health", () => {
  it("hides dead mixes", async () => {
    const mixes = await repo.getDjMixes("paige-julia");
    expect(mixes.map((mix) => mix.id)).toEqual(["mix-live"]);
  });

  it("hides dead links and fills the counters", async () => {
    const links = await repo.getDjLinks("paige-julia");
    expect(links.map((link) => link.id)).toEqual(["link-live"]);
    expect(links[0]).toMatchObject({ helpful: 0, unhelpful: 0, followers: 0, track_count: 0 });
  });
});

describe("SnapshotRepo read model", () => {
  it("keeps only active DJs", async () => {
    const djs = await repo.listDjs();
    expect(djs.map((dj) => dj.id)).toEqual(["paige-julia"]);
    expect(await repo.getDjById("retired-dj")).toBeNull();
  });

  it("filters by query and genre", async () => {
    expect((await repo.listDjs({ query: "jungle" })).map((dj) => dj.id)).toEqual(["paige-julia"]);
    expect(await repo.listDjs({ query: "nothing here" })).toEqual([]);
    expect(await repo.listDjs({ genre: "House" })).toEqual([]);
  });

  it("lists genres once each, sorted", async () => {
    expect(await repo.getGenres()).toEqual(["Drum & Bass", "House", "Jungle"]);
  });

  it("splits upcoming from past events", async () => {
    expect((await repo.getUpcomingEvents()).map((event) => event.id)).toEqual([
      "ra-2468041",
      "ra-billing",
      "ra-label-night",
    ]);
    expect((await repo.getPastEvents()).map((event) => event.id)).toEqual(["past-night"]);
  });

  it("counts upcoming events per venue", async () => {
    expect(await repo.getVenuesWithCounts()).toEqual([
      { id: "carlucci-land", name: "Carlucci Land", upcoming_events: 1 },
      { id: "san-fran", name: "San Fran", upcoming_events: 2 },
    ]);
  });
});

describe("SnapshotRepo event sets", () => {
  it("returns only rows that carry a stage or a set time", async () => {
    const sets = await repo.getEventSets("ra-2468041");
    expect(sets.map((set) => set.dj_id)).toEqual(["paige-julia", "unlisted-dj"]);
  });

  it("falls back to the DJ name, then the id, for the billing text", async () => {
    const sets = await repo.getEventSets("ra-2468041");
    const listed = sets.find((set) => set.dj_id === "paige-julia");
    const unlisted = sets.find((set) => set.dj_id === "unlisted-dj");
    expect(listed).toMatchObject({
      act_label: "Paige Julia",
      dj_name: "Paige Julia",
      dj_listed: true,
    });
    expect(unlisted).toMatchObject({
      act_label: "Manakin b2b J.A.P.R",
      dj_name: "unlisted-dj",
      dj_listed: false,
    });
  });

  it("returns nothing for an event without a timetable", async () => {
    expect(await repo.getEventSets("past-night")).toEqual([]);
  });
});

describe("SnapshotRepo events, venues and dossiers", () => {
  it("returns the lineup in event link order", async () => {
    const lineup = await repo.getEventLineup("ra-2468041");
    // One row per event_djs link, so a DJ billed twice appears twice.
    expect(lineup.map((dj) => dj.id)).toEqual(["paige-julia", "paige-julia"]);
  });

  it("splits gigs into upcoming and past", async () => {
    // Gigs follow the event_djs links, not the event's dj_id column.
    expect((await repo.getDjGigs("paige-julia")).map((event) => event.id)).toEqual(["ra-2468041"]);
    expect((await repo.getDjPastGigs("paige-julia")).map((event) => event.id)).toEqual([
      "past-night",
    ]);
  });

  it("counts collaborators named on the same bill", async () => {
    const collabs = await repo.getDjCollabs("paige-julia");
    expect(collabs.map((collab) => collab.name)).toContain("Manakin b2b J.A.P.R");
    expect(collabs[0].count).toBe(1);
  });

  it("reads a label out of an event name", async () => {
    expect((await repo.getDjLabels("paige-julia")).map((label) => label.name)).toEqual([
      "Sunshine Records",
    ]);
  });

  it("answers venues with their upcoming event counts", async () => {
    expect((await repo.getVenues()).map((venue) => venue.id)).toEqual([
      "carlucci-land",
      "san-fran",
    ]);
    expect((await repo.getVenueById("san-fran"))?.name).toBe("San Fran");
    expect(await repo.getVenueById("missing")).toBeNull();
    expect((await repo.getVenueEvents("San Fran")).map((event) => event.id)).toEqual([
      "ra-billing",
      "ra-label-night",
    ]);
  });

  it("finds an event by id and returns null when it is missing", async () => {
    expect((await repo.getEventById("ra-2468041"))?.name).toBe("Carlucci Carnival 2026");
    expect(await repo.getEventById("nope")).toBeNull();
  });

  it("honours the event query filters", async () => {
    expect((await repo.getEvents({ venue: "San Fran" })).map((event) => event.id)).toEqual([
      "ra-billing",
      "ra-label-night",
    ]);
    expect((await repo.getEvents({ dj: "paige-julia", limit: 1 })).length).toBe(1);
    expect((await repo.getEvents({ upcoming: false })).map((event) => event.id)).toContain(
      "past-night"
    );
  });

  it("ranks popular DJs by score and skips inactive ones", async () => {
    expect((await repo.getPopularDjs()).map((dj) => dj.id)).toEqual(["paige-julia"]);
  });

  it("serves orgs, soundsystems, releases and articles", async () => {
    expect((await repo.getOrgs()).map((org) => org.id)).toEqual(["rhythm-output"]);
    expect((await repo.getSoundsystems()).map((row) => row.id)).toEqual(["sound-system"]);
    expect((await repo.getDjReleases("paige-julia")).map((row) => row.id)).toEqual(["rel-1"]);
    expect((await repo.getDjArticles("paige-julia")).map((row) => row.id)).toEqual(["art-1"]);
  });

  it("returns empty lists for a DJ with nothing recorded", async () => {
    expect(await repo.getDjMixes("retired-dj")).toEqual([]);
    expect(await repo.getDjLinks("retired-dj")).toEqual([]);
    expect(await repo.getDjReleases("retired-dj")).toEqual([]);
  });
});
