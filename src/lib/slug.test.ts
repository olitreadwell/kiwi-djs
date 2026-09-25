import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Paige Julia")).toBe("paige-julia");
  });

  it("collapses runs of punctuation into one hyphen", () => {
    expect(slugify("J.A.P.R & Friends")).toBe("j-a-p-r-friends");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  Sub Focus!  ")).toBe("sub-focus");
  });

  it("keeps digits", () => {
    expect(slugify("DJ 4x4")).toBe("dj-4x4");
  });
});
