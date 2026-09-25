import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/djs",
  "/events",
  "/events/ra-2468041",
  "/venues",
  "/orgs",
  "/soundsystems",
  "/about",
  "/opt-out",
  "/docs",
];

// Automated gate: WCAG 2.2 A/AA + best practice. AAA is a manual human
// review on top of this because axe has no AAA rules.
test.describe("a11y audit (WCAG 2.2 A/AA + best practice)", () => {
  // A DJ profile is audited from the dataset's own first id: a snapshot that
  // is regenerated daily cannot be pinned to one slug.
  test("a DJ profile has no axe violations", async ({ page, request }) => {
    const list = (await (await request.get("/api/v1/djs")).json()) as {
      data?: Array<{ id: string }>;
    };
    const id = list.data?.[0]?.id;
    expect(id, "the dataset lists at least one DJ").toBeTruthy();

    await page.goto(`/djs/${id}`);
    const results = await new AxeBuilder({ page })
      .exclude("iframe")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  for (const route of routes) {
    test(`${route} has no axe violations`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        // Swagger UI renders inside an iframe from the swagger-ui package:
        // its colour contrast and control names are upstream's to fix.
        .exclude("iframe")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
