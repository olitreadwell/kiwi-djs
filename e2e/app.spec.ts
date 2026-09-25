import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// The snapshot dataset is regenerated daily by the scrape loop, and set times
// only exist for events whose source published a timetable. Tests that need
// that data read the snapshot and skip with a reason when it is absent,
// instead of pinning an event id that eventually leaves the data.
const snapshot = JSON.parse(readFileSync("src/data/snapshot.json", "utf8")) as {
  eventDjs?: Array<{ stage?: string | null }>;
};
const datasetHasSetTimes = (snapshot.eventDjs ?? []).some((link) => Boolean(link.stage));

test("homepage renders and health answers", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Kiwi DJs/ })).toBeVisible();

  const health = await request.get("/health");
  expect(health.status()).toBe(200);
  await expect(health.json()).resolves.toMatchObject({ status: "ok" });
});

test("DJ directory lists DJs and opens a profile", async ({ page }) => {
  await page.goto("/djs");
  await expect(page.getByRole("heading", { name: "All DJs" })).toBeVisible();
  // Open whichever DJ the dataset lists first: any pinned name eventually
  // leaves a dataset that is regenerated daily.
  const firstDj = page.locator('a[href^="/djs/"]').first();
  await expect(firstDj).toBeVisible();
  const name = (await firstDj.innerText()).trim().split("\n")[0];
  await firstDj.click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
});

test("event calendar lists gigs that link to their event page", async ({ page }) => {
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "Event calendar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Upcoming" })).toBeVisible();
  const firstEvent = page.locator('a[href^="/events/"]').first();
  await expect(firstEvent).toBeVisible();
  await firstEvent.click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("an event page renders the set times its snapshot carries", async ({ page, request }) => {
  test.skip(!datasetHasSetTimes, "this snapshot publishes no set times yet");

  const response = await request.get("/api/v1/events");
  const body = (await response.json()) as { data?: Array<{ id: string }> };
  const events = body.data ?? [];
  expect(events.length).toBeGreaterThan(0);

  // Set times only appear for events whose source published a timetable, so
  // walk the list until a page prints them, then check that page is
  // consistent: a Set times heading must come with slots under it.
  let found = false;
  for (const event of events.slice(0, 40)) {
    await page.goto(`/events/${event.id}`);
    if ((await page.getByRole("heading", { name: "Set times" }).count()) === 0) continue;
    const slots = await page.locator("section li").count();
    expect(slots, `event ${event.id} prints a Set times heading with no slots`).toBeGreaterThan(0);
    found = true;
    break;
  }
  expect(found, "no event page printed the set times the snapshot carries").toBe(true);
});

test("venues and org listings render", async ({ page }) => {
  await page.goto("/venues");
  await expect(page.getByRole("heading", { name: "Venues" })).toBeVisible();
  await page.goto("/orgs");
  await expect(page.getByRole("heading", { name: "Orgs & collectives" })).toBeVisible();
});

test("opt-out page renders and explains the process", async ({ page }) => {
  await page.goto("/opt-out");
  await expect(page.getByRole("heading", { name: "Remove your profile" })).toBeVisible();
});

test("openapi spec is served and the docs page embeds swagger", async ({ page, request }) => {
  const spec = await request.get("/api/openapi.json");
  expect(spec.status()).toBe(200);
  const body = (await spec.json()) as { openapi: string; paths: Record<string, unknown> };
  expect(body.openapi).toBe("3.1.0");
  // Paths are relative to the spec's server URL (/api/v1).
  expect(body.paths["/djs"]).toBeDefined();
  expect(body.paths["/events"]).toBeDefined();

  await page.goto("/docs");
  await expect(page.getByRole("heading", { name: "API docs" })).toBeVisible();
  await expect(page.locator('iframe[title="Swagger UI"]')).toBeVisible();
});
