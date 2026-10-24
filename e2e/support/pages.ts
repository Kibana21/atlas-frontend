// Page helpers shared by the acceptance specs.
import { readFileSync } from "node:fs";

import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";

export function readSpecsLock(): { specs_commit: string; contract_version: string } {
  const fields: Record<string, string> = {};
  for (const line of readFileSync("specs.lock", "utf8").split("\n")) {
    const m = /^([a-z_]+):\s*"?([^"#]*?)"?\s*$/.exec(line);
    if (m?.[1] && m[2] !== undefined) fields[m[1]] = m[2];
  }
  return { specs_commit: fields.specs_commit ?? "", contract_version: fields.contract_version ?? "" };
}

export class StatusPage {
  readonly summary: Locator;
  readonly liveRegion: Locator;
  readonly checkAgain: Locator;

  constructor(readonly page: Page) {
    this.summary = page.locator("[data-tone]").first();
    this.liveRegion = page.getByRole("status");
    this.checkAgain = page.getByRole("button", { name: "Check again" });
  }

  async open(): Promise<void> {
    await this.page.goto("/status");
    await expect(this.page.getByRole("heading", { level: 1, name: "System status" })).toBeVisible();
  }

  /** Presses "Check again" and waits until every check has finished. */
  async checkAgainAndWait(): Promise<void> {
    await this.checkAgain.click();
    await expect(this.checkAgain).toBeEnabled();
  }

  async expectSummary(label: string): Promise<void> {
    await expect(this.summary).toHaveText(label);
    await expect(this.liveRegion).toContainText(`Status: ${label}.`);
  }

  check(name: "API" | "Database" | "Redis"): Locator {
    return this.page
      .getByRole("listitem")
      .filter({ has: this.page.getByRole("heading", { level: 3, name }) });
  }

  provenance(term: string): Locator {
    return this.page.locator("dt", { hasText: term }).locator("xpath=following-sibling::dd[1]");
  }

  /** The correlation ID the page shows for a failure. */
  async shownCorrelationId(): Promise<string> {
    const text = await this.page.getByText(/^Correlation ID /).textContent();
    return (text ?? "").replace(/^Correlation ID\s*/, "").trim();
  }
}
