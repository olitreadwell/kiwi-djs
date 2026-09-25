import { describe, expect, it } from "vitest";
import {
  cityFromLocation,
  classifyProfileLocation,
  hasNzLocationEvidence,
  isNzLocation,
  isNzProfileLocation,
} from "./locations";

describe("isNzLocation", () => {
  it("trusts the country code", () => {
    expect(isNzLocation(undefined, undefined, "NZ")).toBe(true);
    expect(isNzLocation("Melbourne", undefined, "AU")).toBe(false);
  });

  it("reads the country name", () => {
    expect(isNzLocation(undefined, "New Zealand")).toBe(true);
    expect(isNzLocation(undefined, "Aotearoa")).toBe(true);
  });

  it("reads a known NZ city", () => {
    expect(isNzLocation("  Queenstown ", undefined, undefined)).toBe(true);
    expect(isNzLocation("Melbourne", undefined, undefined)).toBe(false);
  });
});

describe("cityFromLocation", () => {
  it("picks the city out of a profile string", () => {
    expect(cityFromLocation("SoundCloud: Queenstown, New Zealand")).toBe("queenstown");
    expect(cityFromLocation("Wellington")).toBe("wellington");
  });

  it("returns null when no NZ city is named", () => {
    expect(cityFromLocation("SoundCloud: Melbourne")).toBeNull();
    expect(cityFromLocation(null)).toBeNull();
    expect(cityFromLocation("")).toBeNull();
  });
});

describe("isNzProfileLocation", () => {
  it("treats a missing location as not evidence against a DJ", () => {
    expect(isNzProfileLocation(null)).toBe(true);
    expect(isNzProfileLocation(undefined)).toBe(true);
  });

  it("accepts a city, the country or the code", () => {
    expect(isNzProfileLocation("Dunedin")).toBe(true);
    expect(isNzProfileLocation("New Zealand")).toBe(true);
    expect(isNzProfileLocation("NZ")).toBe(true);
  });

  it("rejects an overseas place", () => {
    expect(isNzProfileLocation("SoundCloud: Melbourne")).toBe(false);
  });
});

describe("classifyProfileLocation", () => {
  it("classifies NZ locations", () => {
    expect(classifyProfileLocation("Christchurch, New Zealand")).toBe("nz");
  });

  it("classifies known overseas locations", () => {
    expect(classifyProfileLocation("SoundCloud: Melbourne")).toBe("non-nz");
    expect(classifyProfileLocation("Berlin, Germany")).toBe("non-nz");
  });

  it("leaves ambiguous strings unknown", () => {
    expect(classifyProfileLocation("Everywhere")).toBe("unknown");
    expect(classifyProfileLocation("a.k.a. DJ Fizz")).toBe("unknown");
    expect(classifyProfileLocation(null)).toBe("unknown");
  });
});

describe("hasNzLocationEvidence", () => {
  it("counts a location source and nothing else", () => {
    expect(hasNzLocationEvidence(["location", "gig"])).toBe(true);
    expect(hasNzLocationEvidence(["gig"])).toBe(false);
    expect(hasNzLocationEvidence([])).toBe(false);
  });
});
