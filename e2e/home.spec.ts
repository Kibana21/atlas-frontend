// `/` placeholder (ATLAS-001 FR-55, AC-14): one heading, one working link, a skip link, no product UI.
import { expect, test } from "./support/fixtures";

test("home: exactly one interactive element, which opens the status page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Atlas/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Atlas");
  await expect(page.getByRole("heading")).toHaveCount(1);
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);

  const main = page.getByRole("main");
  await expect(
    main.locator("a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])"),
  ).toHaveCount(1);
  const interactive = page.locator("a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
  await expect(interactive).toHaveCount(2); // the skip link and the status link
  await expect(interactive.first()).toHaveText("Skip to main content");

  await main.getByRole("link", { name: "View system status" }).click();
  await expect(page).toHaveURL(/\/status$/);
  await expect(page.locator("[data-tone]").first()).toHaveText("Ready");
});
