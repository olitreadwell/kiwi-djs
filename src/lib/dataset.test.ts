import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/queries", () => ({
  listDjs: vi.fn(),
  getEvents: vi.fn(),
  getVenues: vi.fn(),
  getDjLinks: vi.fn(),
  getDjMixes: vi.fn(),
  getDjArticles: vi.fn(),
}));

import { buildDataset } from "./dataset";
import {
  getDjArticles,
  getDjLinks,
  getDjMixes,
  getEvents,
  getVenues,
  listDjs,
} from "@/lib/queries";

const djs = [
  { id: "paige-julia", name: "Paige Julia" },
  { id: "manakin", name: "Manakin" },
];

beforeEach(() => {
  vi.mocked(listDjs).mockResolvedValue(djs as never);
  vi.mocked(getEvents).mockResolvedValue([] as never);
  vi.mocked(getVenues).mockResolvedValue([] as never);
  vi.mocked(getDjLinks).mockResolvedValue([{ id: "link-1" }] as never);
  vi.mocked(getDjMixes).mockResolvedValue([{ id: "mix-1" }] as never);
  vi.mocked(getDjArticles).mockResolvedValue([{ id: "art-1" }] as never);
});

describe("buildDataset", () => {
  it("flattens the per-DJ rows into one dataset", async () => {
    const { dataset } = await buildDataset();
    expect(dataset.djs).toHaveLength(2);
    expect(dataset.links.map((row) => row.id)).toEqual(["link-1", "link-1"]);
    expect(dataset.mixes).toHaveLength(2);
    expect(dataset.articles).toHaveLength(2);
  });

  it("stamps an exportedAt timestamp and a short version", async () => {
    const { dataset, version } = await buildDataset();
    expect(Number.isNaN(Date.parse(dataset.exportedAt))).toBe(false);
    expect(version).toMatch(/^[0-9a-f]{12}$/);
    expect(dataset.version).toBe(version);
  });

  it("derives the same version for the same data and a new one when it changes", async () => {
    const first = await buildDataset();
    const second = await buildDataset();
    expect(second.version).toBe(first.version);
    vi.mocked(getDjMixes).mockResolvedValue([{ id: "mix-2" }] as never);
    expect((await buildDataset()).version).not.toBe(first.version);
  });
});
