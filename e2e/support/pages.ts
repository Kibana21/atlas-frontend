// Page helpers shared by the acceptance specs.
import { readFileSync } from "node:fs";

import type { Locator, Page, Request } from "@playwright/test";

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

  /**
   * Resolves when the next readiness request finishes or fails (a real network event, not an interception).
   * Arm it BEFORE the action that triggers the refetch.
   */
  nextReadinessSettled(): Promise<void> {
    return new Promise((resolve) => {
      const done = (request: Request) => {
        if (!request.url().endsWith("/api/v1/health/ready")) return;
        this.page.off("requestfinished", done);
        this.page.off("requestfailed", done);
        resolve();
      };
      this.page.on("requestfinished", done);
      this.page.on("requestfailed", done);
    });
  }

  /** Waits until no check is running ("Check again" is aria-disabled while busy, never disabled). */
  async expectIdle(): Promise<void> {
    await expect(this.checkAgain).toHaveAttribute("aria-disabled", "false");
  }

  /** Presses "Check again" and waits until this refetch has really completed. */
  async checkAgainAndWait(): Promise<void> {
    const settled = this.nextReadinessSettled();
    await this.checkAgain.click();
    await settled;
    await this.expectIdle();
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
