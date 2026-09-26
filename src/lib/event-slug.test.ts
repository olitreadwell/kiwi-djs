import { describe, expect, it } from "vitest";
import { eventSlug, eventYear, slugifyEventName, uniqueEventSlug } from "./event-slug";

describe("slugifyEventName", () => {
  it("lower-cases and hyphenates", () => {
    expect(slugifyEventName("Carlucci Carnival")).toBe("carlucci-carnival");
  });

  it("drops punctuation and collapses separators", () => {
    expect(slugifyEventName("Easter Weekend: Night 2 (Warehouse)")).toBe(
      "easter-weekend-night-2-warehouse"
    );
  });

  it("strips accents", () => {
    expect(slugifyEventName("Röyksopp & Friends")).toBe("royksopp-friends");
  });

  it("returns an empty string when there is nothing to slug", () => {
    expect(slugifyEventName("!!!")).toBe("");
  });
});

describe("eventYear", () => {
  it("reads the year in the venue timezone, not UTC", () => {
    // 31 Dec 21:00 NZDT is 31 Dec 08:00 UTC, still the same year here.
    expect(eventYear("2026-12-31T21:00:00+13:00")).toBe("2026");
    // 1 Jan 01:00 NZDT is 31 Dec 12:00 UTC, so UTC would say the year before.
    expect(eventYear("2027-01-01T01:00:00+13:00")).toBe("2027");
  });

  it("returns null for a missing or unparseable date", () => {
    expect(eventYear(null)).toBeNull();
    expect(eventYear("not a date")).toBeNull();
  });
});

describe("eventSlug", () => {
  it("puts the year first", () => {
    expect(eventSlug("Carlucci Carnival", "2026-09-26T15:00:00+12:00")).toBe(
      "2026-carlucci-carnival"
    );
  });

  it("returns null when the name or the date is missing", () => {
    expect(eventSlug(null, "2026-09-26T15:00:00+12:00")).toBeNull();
    expect(eventSlug("Carlucci Carnival", null)).toBeNull();
    expect(eventSlug("!!!", "2026-09-26T15:00:00+12:00")).toBeNull();
  });
});

describe("uniqueEventSlug", () => {
  it("keeps the base slug when it is free", () => {
    expect(uniqueEventSlug("2026-carlucci-carnival", [])).toBe("2026-carlucci-carnival");
  });

  it("numbers later clashes", () => {
    const taken = ["2026-carlucci-carnival", "2026-carlucci-carnival-2"];
    expect(uniqueEventSlug("2026-carlucci-carnival", taken)).toBe("2026-carlucci-carnival-3");
  });
});
