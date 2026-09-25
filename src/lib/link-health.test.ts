import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./scrapers/http", () => ({
  UA: "test-agent",
  checkRobots: vi.fn(async () => true),
}));

import { checkLinkHealth, checkSoundCloudUrl, sweepLinkHealth } from "./link-health";
import { checkRobots } from "./scrapers/http";

const fetchMock = vi.fn();

function respondWith(status: number) {
  fetchMock.mockResolvedValue(new Response(null, { status }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(checkRobots).mockReset();
  vi.mocked(checkRobots).mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkSoundCloudUrl", () => {
  it("reads 200 as live", async () => {
    respondWith(200);
    await expect(checkSoundCloudUrl("https://soundcloud.com/paige-julia")).resolves.toBe("live");
  });

  it("reads 404 and 410 as dead", async () => {
    respondWith(404);
    await expect(checkSoundCloudUrl("https://soundcloud.com/gone")).resolves.toBe("dead");
    respondWith(410);
    await expect(checkSoundCloudUrl("https://soundcloud.com/gone")).resolves.toBe("dead");
  });

  it("reads 403 as blocked, not dead", async () => {
    respondWith(403);
    await expect(checkSoundCloudUrl("https://soundcloud.com/private")).resolves.toBe("blocked");
  });

  it("reads anything else as unknown", async () => {
    respondWith(503);
    await expect(checkSoundCloudUrl("https://soundcloud.com/flaky")).resolves.toBe("unknown");
  });

  it("returns unknown when the probe throws", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    await expect(checkSoundCloudUrl("https://soundcloud.com/flaky")).resolves.toBe("unknown");
  });

  it("probes through oembed with the URL encoded", async () => {
    respondWith(200);
    await checkSoundCloudUrl("https://soundcloud.com/paige-julia/sets/one");
    const [target] = fetchMock.mock.calls[0] as [string];
    expect(target).toContain("https://soundcloud.com/oembed?format=json&url=");
    expect(target).toContain(encodeURIComponent("https://soundcloud.com/paige-julia/sets/one"));
  });
});

describe("checkLinkHealth", () => {
  it("skips the probe when robots.txt disallows it", async () => {
    vi.mocked(checkRobots).mockResolvedValue(false);
    await expect(checkLinkHealth("https://soundcloud.com/paige-julia")).resolves.toBe("unknown");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a plain GET for hosts other than SoundCloud", async () => {
    respondWith(200);
    await expect(checkLinkHealth("https://www.mixcloud.com/paige-julia/")).resolves.toBe("live");
    expect(checkRobots).not.toHaveBeenCalled();
  });

  it("treats a rate-limited 429 as unknown", async () => {
    respondWith(429);
    await expect(checkLinkHealth("https://www.mixcloud.com/paige-julia/")).resolves.toBe("unknown");
  });

  it("marks a 404 on any host as dead", async () => {
    respondWith(404);
    await expect(checkLinkHealth("https://example.com/gone")).resolves.toBe("dead");
  });
});

describe("sweepLinkHealth", () => {
  it("maps every URL to its status and reports each result", async () => {
    fetchMock.mockImplementation(
      async (url: string) => new Response(null, { status: url.includes("gone") ? 404 : 200 })
    );
    const seen: Array<[string, string]> = [];
    const results = await sweepLinkHealth(
      ["https://example.com/here", "https://example.com/gone"],
      {
        delayMs: 0,
        onResult: (url, status) => seen.push([url, status]),
      }
    );
    expect([...results.entries()]).toEqual([
      ["https://example.com/here", "live"],
      ["https://example.com/gone", "dead"],
    ]);
    expect(seen).toEqual([
      ["https://example.com/here", "live"],
      ["https://example.com/gone", "dead"],
    ]);
  });
});
