import { expect, test } from "@playwright/test";

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
  await page
    .getByRole("link", { name: /Xavier/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Xavier", level: 1 })).toBeVisible();
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

test("the Carlucci event page prints its stage timetables", async ({ page }) => {
  await page.goto("/events/ra-2468041");
  await expect(page.getByRole("heading", { name: "Set times" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Steel Circus" })).toBeVisible();
  await expect(page.getByText("Paige Julia").first()).toBeVisible();
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
