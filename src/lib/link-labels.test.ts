import { describe, expect, it } from "vitest";
import { displayLabel, linkDomain, linkLabel, pillLabel } from "./link-labels";

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
