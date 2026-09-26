import { describe, expect, it } from "vitest";
import {
  displayLabel,
  linkDomain,
  linkLabel,
  pillLabel,
  prioritiseEventLinks,
} from "./link-labels";

describe("linkLabel", () => {
  it("prefers a stored label", () => {
    expect(linkLabel("soundcloud", "Paige Julia on SoundCloud")).toBe("Paige Julia on SoundCloud");
  });

  it("falls back to the platform name, then the raw type", () => {
    expect(linkLabel("soundcloud", null)).toBe("SoundCloud");
    expect(linkLabel("unknown-platform", null)).toBe("unknown-platform");
  });
});

describe("pillLabel", () => {
  it("shows the platform name only", () => {
    expect(pillLabel("resident-advisor")).toBe("Resident Advisor");
    expect(pillLabel("mastodon")).toBe("Mastodon");
  });
});

describe("displayLabel", () => {
  it("strips URLs and type prefixes left by older enrichment runs", () => {
    expect(displayLabel("soundcloud", "soundcloud: https://soundcloud.com/paige-julia")).toBe(
      "SoundCloud"
    );
  });

  it("strips a trailing colon or space", () => {
    expect(displayLabel("instagram", "Instagram: ")).toBe("Instagram");
  });

  it("keeps a real label", () => {
    expect(displayLabel("website", "Booking page")).toBe("Booking page");
  });
});

describe("linkDomain", () => {
  it("drops the www prefix", () => {
    expect(linkDomain("https://www.mixcloud.com/paige-julia/")).toBe("mixcloud.com");
  });

  it("returns the input when the URL is malformed", () => {
    expect(linkDomain("not a url")).toBe("not a url");
  });
});

describe("prioritiseEventLinks", () => {
  it("puts music and socials ahead of database entries", () => {
    const sorted = prioritiseEventLinks([
      { type: "discogs", url: "https://discogs.com/artist/1" },
      { type: "instagram", url: "https://instagram.com/paigejulia.music" },
      { type: "soundcloud", url: "https://soundcloud.com/paigelol" },
    ]);
    expect(sorted.map((link) => link.type)).toEqual(["soundcloud", "instagram", "discogs"]);
  });

  it("keeps one pill per destination when two sources stored the URL differently", () => {
    const sorted = prioritiseEventLinks([
      { type: "bandcamp", url: "https://paigejulia.bandcamp.com/" },
      { type: "bandcamp", url: "https://www.paigejulia.bandcamp.com" },
    ]);
    expect(sorted).toHaveLength(1);
  });

  it("keeps the incoming order among equally ranked links", () => {
    const sorted = prioritiseEventLinks([
      { type: "website", url: "https://booking.example" },
      { type: "website", url: "https://label.example" },
    ]);
    expect(sorted.map((link) => link.url)).toEqual([
      "https://booking.example",
      "https://label.example",
    ]);
  });
});
