import { describe, expect, it } from "vitest";
import {
  genreAccent,
  genrePill,
  hasSpecificGenre,
  isGenreTag,
  normaliseGenre,
  normaliseGenres,
  topGenres,
} from "./genres";

describe("normaliseGenres", () => {
  it("splits compound tags on commas and slashes", () => {
    expect(normaliseGenres(["deep house , techno"]).length).toBeGreaterThanOrEqual(2);
  });

  it("dedupes repeated genres", () => {
    const once = normaliseGenre("techno");
    expect(normaliseGenres([once, once, once])).toEqual([once]);
  });

  it("returns an empty list for empty input", () => {
    expect(normaliseGenres([])).toEqual([]);
    expect(normaliseGenre("   ")).toBe("");
  });

  it("title-cases an unknown genre rather than dropping it", () => {
    expect(normaliseGenre("zouk bass")).toBe("Zouk Bass");
  });
});

describe("isGenreTag", () => {
  it("accepts single known words", () => {
    expect(isGenreTag("house")).toBe(true);
    expect(isGenreTag("techno")).toBe(true);
  });

  it("accepts compound tags with a known two-word window", () => {
    expect(isGenreTag("tech house")).toBe(true);
  });

  it("rejects noise, empty strings and over-long tags", () => {
    expect(isGenreTag("")).toBe(false);
    expect(isGenreTag("   ")).toBe(false);
    expect(isGenreTag("a".repeat(41))).toBe(false);
  });

  it("does not treat a word that merely starts with a genre as one", () => {
    expect(isGenreTag("technology")).toBe(false);
  });
});

describe("hasSpecificGenre", () => {
  it("is false for umbrella genres only", () => {
    expect(hasSpecificGenre(["Dance", "Electronic"])).toBe(false);
  });

  it("is true once a subgenre is present", () => {
    expect(hasSpecificGenre(["Dance", "Techno"])).toBe(true);
  });

  it("is false with no genres at all", () => {
    expect(hasSpecificGenre([])).toBe(false);
  });
});

describe("genre colors", () => {
  it("returns a stable pill and tint per genre", () => {
    expect(genrePill("Techno")).toBe(genrePill("Techno"));
    expect(genreAccent(["Techno"])).toBe(genreAccent(["Techno"]));
  });

  it("still returns a tint for an unknown genre so pills are never blank", () => {
    expect(genrePill("Zouk Bass").length).toBeGreaterThan(0);
  });

  it("falls back to the neutral tint with no genres", () => {
    expect(genreAccent([])).toContain("border-edge");
  });
});

describe("topGenres", () => {
  it("caps the list and keeps the order", () => {
    expect(topGenres(["A", "B", "C", "D", "E", "F"])).toEqual(["A", "B", "C", "D", "E"]);
    expect(topGenres(["A", "B", "C"], 2)).toEqual(["A", "B"]);
  });
});
