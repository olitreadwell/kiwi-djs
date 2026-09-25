import { describe, expect, it } from "vitest";
import { isGenericGenreOnly, profileGaps, profileTier } from "./profile-tier";
import type { DjRow } from "./repo/types";

function djRow(overrides: Partial<DjRow> = {}): DjRow {
  return {
    id: "paige-julia",
    name: "Paige Julia",
    bio: null,
    genres: [],
    image_url: null,
    soundcloud_url: null,
    instagram_url: null,
    facebook_url: null,
    mixcloud_url: null,
    website_url: null,
    active: true,
    popularity: 0,
    data_completeness: 0,
    verification_level: 1,
    verification_sources: [],
    source: "test",
    is_nz: true,
    upcoming_events: 0,
    last_played_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("profileTier", () => {
  it("is tier1 for a complete dossier", () => {
    const dj = djRow({
      data_completeness: 70,
      mix_count: 3,
      image_url: "https://example.com/photo.jpg",
      bio: "Wellington drum and bass DJ.",
      genres: ["Drum & Bass"],
    });
    expect(profileTier(dj)).toBe("tier1");
  });

  it("is tier2 with a photo and either mixes or gigs", () => {
    expect(profileTier(djRow({ data_completeness: 40, mix_count: 1, image_url: "x" }))).toBe(
      "tier2"
    );
    expect(profileTier(djRow({ data_completeness: 40, upcoming_events: 2, image_url: "x" }))).toBe(
      "tier2"
    );
  });

  it("is tier3 for a starter profile", () => {
    expect(profileTier(djRow())).toBe("tier3");
  });
});

describe("profileGaps", () => {
  it("lists the missing pieces, capped at five", () => {
    expect(profileGaps(djRow())).toEqual(["photo", "short bio", "genres", "gigs"]);
  });

  it("stops listing what is already there", () => {
    const dj = djRow({ image_url: "x", mix_count: 2, upcoming_events: 1, bio: "A bio" });
    expect(profileGaps(dj)).toEqual(["genres"]);
  });

  it("asks for specific subgenres when only generic ones exist", () => {
    expect(profileGaps(djRow({ genres: ["Electronic"] }))).toContain("specific subgenres");
  });
});

describe("isGenericGenreOnly", () => {
  it("is false for an ungenred DJ", () => {
    expect(isGenericGenreOnly([])).toBe(false);
  });

  it("is true when every genre is generic", () => {
    expect(isGenericGenreOnly(["Dance", "Electronic"])).toBe(true);
    expect(isGenericGenreOnly(["Dance", "Drum & Bass"])).toBe(false);
  });
});
