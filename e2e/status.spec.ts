// /status against the real backend (ATLAS-001 AC-09, AC-10, AC-15, AC-16): healthy, dependency outages
// and their recovery, backend unreachable, diagnostics disabled. Outages come from the E2E stack's own
// proxies; the browser's requests are never intercepted.
import { expect, test } from "./support/fixtures";
import { StatusPage, readSpecsLock } from "./support/pages";

const SHA = /^[0-9a-f]{40}$/;

test.describe("status page against the real backend", () => {
  test("healthy: every check green with true build provenance", async ({ page, record }) => {
    const status = new StatusPage(page);
    await status.open();
    await status.expectSummary("Ready");
    for (const name of ["API", "Database", "Redis"] as const) {
      await expect(status.check(name)).toContainText("Operational");
    }
    const lock = readSpecsLock();
    await expect(status.provenance("Environment")).toHaveText("test");
    await expect(status.provenance("Contract version")).toHaveText(lock.contract_version);
    await expect(status.provenance("Database migration")).toHaveText("0001_baseline");
    await expect(status.provenance("Specs commit")).toHaveText(lock.specs_commit);
    const backendSha = (await status.provenance("Backend commit").textContent()) ?? "";
    expect(backendSha).toMatch(SHA);
    if (process.env.ATLAS_BUILD_SHA) expect(backendSha).toBe(process.env.ATLAS_BUILD_SHA);
    await expect(status.provenance("Frontend commit")).toHaveText(
      process.env.NEXT_PUBLIC_ATLAS_FRONTEND_SHA ?? "unknown",
    );
    await expect(page.getByText(/^Correlation ID /)).toHaveCount(0);

    // Every request carried a client correlation ID, and the backend echoed it (checked against the
    // contract by the fixture as well).
    await record.settled();
    expect(record.responses.map((r) => new URL(r.url).pathname).sort()).toEqual([
      "/api/v1/diagnostics/build",
      "/api/v1/health/live",
      "/api/v1/health/ready",
    ]);
    for (const r of record.responses) {
      expect(r.requestCorrelationId).toMatch(/^web_[0-9a-f]{32}$/);
      expect(r.headers["x-correlation-id"]).toBe(r.requestCorrelationId);
    }
  });

  for (const dependency of [
    {
      fault: "database",
      check: "Database",
      other: "Redis",
      detail: "the database",
      event: "database_probe_failed",
    },
    { fault: "redis", check: "Redis", other: "Database", detail: "Redis", event: "redis_command_failed" },
  ] as const) {
    test(`${dependency.fault} unavailable: degraded with its correlation ID, then recovers`, async ({
      page,
      record,
      stack,
    }) => {
      record.allowFailedApiRequests(); // the browser reports the 503 itself
      const status = new StatusPage(page);
      await status.open();
      await status.expectSummary("Ready");

      await stack.down(dependency.fault);
      await status.checkAgainAndWait();
      await status.expectSummary("Degraded");
      await expect(
        page.locator("p:not([role=status])", {
          hasText: `The API is running, but ${dependency.detail} did not respond in time.`,
        }),
      ).toBeVisible();
      await expect(status.check(dependency.check)).toContainText("Not responding");
      // The 503 names only the failed check, so the other dependency is unknown, not assumed healthy.
      await expect(status.check(dependency.other)).toContainText("Not checked");
      await expect(status.check("API")).toContainText("Operational");

      // The ID on screen is the one the browser sent, and the backend logged the failure under it.
      await record.settled();
      const ready = record.responses.filter((r) => r.url.endsWith("/health/ready")).at(-1);
      expect(ready?.status).toBe(503);
      const shown = await status.shownCorrelationId();
      expect(shown).toBe(ready?.requestCorrelationId);
      expect(JSON.parse(ready?.body ?? "{}")).toMatchObject({
        error: {
          code: "DEPENDENCY_UNAVAILABLE",
          correlation_id: shown,
          details: { failed_check: dependency.fault },
        },
      });
      const events = await stack.logEvents("api-primary", shown);
      expect(events.map((e) => e.event)).toContain(dependency.event);

      await stack.up(dependency.fault);
      await status.checkAgainAndWait();
      await status.expectSummary("Ready");
      await expect(status.check(dependency.check)).toContainText("Operational");
      await expect(page.getByText(/^Correlation ID /)).toHaveCount(0);
    });
  }

  test("backend unreachable: no fabricated values, then recovers on Check again", async ({
    page,
    record,
    stack,
  }) => {
    record.allowFailedApiRequests();
    await stack.down("api");
    const status = new StatusPage(page);
    await status.open();
    await status.expectSummary("API unreachable");
    for (const name of ["API", "Database", "Redis"] as const) {
      await expect(status.check(name)).toContainText("Not checked");
    }
    await expect(page.getByText("Operational")).toHaveCount(0);
    for (const term of [
      "Environment",
      "Contract version",
      "Database migration",
      "Backend commit",
      "Specs commit",
    ]) {
      await expect(status.provenance(term)).toHaveText("Unavailable");
    }
    // A client-side ID identifies the failed attempt; it never reached the backend.
    const shown = await status.shownCorrelationId();
    expect(shown).toMatch(/^web_[0-9a-f]{32}$/);
    expect(record.requestFailures.length).toBeGreaterThan(0);
    expect(await stack.logEvents("api-primary", shown)).toEqual([]);

    await stack.up("api");
    await status.checkAgainAndWait();
    await status.expectSummary("Ready");
    await expect(status.provenance("Database migration")).toHaveText("0001_baseline");
  });

  test("backend becomes unreachable after a healthy check", async ({ page, record, stack }) => {
    record.allowFailedApiRequests();
    const status = new StatusPage(page);
    await status.open();
    await status.expectSummary("Ready");
    await stack.down("api");
    await status.checkAgainAndWait();
    await status.expectSummary("API unreachable");
    await expect(page.getByText("Operational")).toHaveCount(0); // the earlier green state is not kept
  });

  test("diagnostics disabled: health shown, provenance withheld (AC-09, AC-15 d)", async ({
    page,
    record,
    stack,
  }) => {
    record.allowFailedApiRequests(); // the browser reports the 404 itself
    await stack.upstream("diagnostics-disabled");
    const status = new StatusPage(page);
    await status.open();
    await status.expectSummary("Ready, diagnostics disabled");
    for (const name of ["API", "Database", "Redis"] as const) {
      await expect(status.check(name)).toContainText("Operational");
    }
    await expect(
      page.getByText("Build diagnostics are disabled in this environment.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("dt")).toHaveCount(0);
    await record.settled();
    const build = record.responses.find((r) => r.url.endsWith("/diagnostics/build"));
    expect(build?.status).toBe(404);
    expect(JSON.parse(build?.body ?? "{}")).toMatchObject({ error: { code: "NOT_FOUND" } });

    await stack.upstream("primary");
    await status.checkAgainAndWait();
    await status.expectSummary("Ready");
    await expect(status.provenance("Database migration")).toHaveText("0001_baseline");
  });

  test("every backend process stays up through the simulated outages", async ({ page, stack }) => {
    const status = new StatusPage(page);
    await status.open();
    await status.expectSummary("Ready");
    const { processes } = await stack.state();
    expect(processes).toEqual({
      "api-primary": { running: true },
      "api-no-diagnostics": { running: true },
      worker: { running: true },
    });
  });
});
