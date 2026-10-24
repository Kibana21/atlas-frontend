// Playwright fixtures for the ATLAS-001 acceptance suite. They only OBSERVE the browser (console, CSP
// violations, network responses); nothing intercepts or mocks a request (AC-16: no page.route).
import { test as base, expect, type ConsoleMessage, type Page } from "@playwright/test";

import { API_BASE_URL, CONTROL_URL, type ApiUpstream, type Fault, type Service } from "./config";
import { Contract, type ObservedResponse } from "./contract";

const contract = new Contract();

/** Client for the E2E stack's control API (fault proxies and API upstream). */
export class StackControl {
  async #post(path: string): Promise<void> {
    const response = await fetch(`${CONTROL_URL}${path}`, { method: "POST" });
    if (!response.ok) throw new Error(`stack control ${path}: ${response.status} ${await response.text()}`);
  }

  down(target: Fault) {
    return this.#post(`/fault/${target}/down`);
  }

  up(target: Fault) {
    return this.#post(`/fault/${target}/up`);
  }

  upstream(name: ApiUpstream) {
    return this.#post(`/upstream/${name}`);
  }

  reset() {
    return this.#post("/reset");
  }

  /** JSON log events of a backend process that carry this correlation ID. */
  async logEvents(service: Service, correlationId: string): Promise<Array<Record<string, unknown>>> {
    const url = `${CONTROL_URL}/logs/${service}?correlation_id=${encodeURIComponent(correlationId)}`;
    return (await (await fetch(url)).json()) as Array<Record<string, unknown>>;
  }

  async state(): Promise<{ processes: Record<string, { running?: true; exited?: unknown }> }> {
    return (await (await fetch(`${CONTROL_URL}/state`)).json()) as {
      processes: Record<string, { running?: true; exited?: unknown }>;
    };
  }
}

/** What the browser did during one test, checked automatically when the test ends. */
export class BrowserRecord {
  readonly console: ConsoleMessage[] = [];
  readonly pageErrors: Error[] = [];
  readonly responses: ObservedResponse[] = [];
  readonly requestFailures: string[] = [];
  readonly #pending: Array<Promise<void>> = [];
  #allowFailedApiRequests = false;
  readonly #allowedConsole: RegExp[] = [];

  /** The test makes the API fail on purpose: the browser's own "Failed to load resource" reports are expected. */
  allowFailedApiRequests(): void {
    this.#allowFailedApiRequests = true;
  }

  /** A console message this test causes on purpose (for example the CSP enforcement probe). */
  allowConsole(pattern: RegExp): void {
    this.#allowedConsole.push(pattern);
  }

  attach(page: Page): void {
    page.on("console", (message) => this.console.push(message));
    page.on("pageerror", (error) => this.pageErrors.push(error));
    page.on("requestfailed", (request) => {
      if (request.url().startsWith(API_BASE_URL)) this.requestFailures.push(request.url());
    });
    page.on("response", (response) => {
      if (!response.url().startsWith(API_BASE_URL) || response.request().method() === "OPTIONS") return;
      this.#pending.push(
        (async () => {
          this.responses.push({
            url: response.url(),
            method: response.request().method(),
            status: response.status(),
            headers: await response.allHeaders(),
            requestCorrelationId: (await response.request().headerValue("x-correlation-id")) ?? undefined,
            body: await response.text(),
          });
        })(),
      );
    });
  }

  async settled(): Promise<void> {
    await Promise.allSettled(this.#pending);
  }

  /** Console errors and warnings that are not an expected, deliberately caused API failure. */
  unexpectedConsole(): string[] {
    return this.console
      .filter((m) => m.type() === "error" || m.type() === "warning")
      .filter((m) => {
        const expectedFailure =
          this.#allowFailedApiRequests &&
          m.location().url.startsWith(API_BASE_URL) &&
          /^Failed to load resource: (net::ERR_CONNECTION_REFUSED|net::ERR_EMPTY_RESPONSE|net::ERR_CONNECTION_RESET|the server responded with a status of (404|503))/.test(
            m.text(),
          );
        return !expectedFailure && !this.#allowedConsole.some((rx) => rx.test(m.text()));
      })
      .map((m) => `${m.type()}: ${m.text()} (${m.location().url})`);
  }
}

export const test = base.extend<{ stack: StackControl; record: BrowserRecord }>({
  stack: [
    async ({}, use) => {
      const control = new StackControl();
      await control.reset(); // every test starts healthy, on the diagnostics-enabled backend
      await use(control);
      await control.reset();
    },
    { auto: true },
  ],
  record: [
    async ({ page }, use) => {
      const record = new BrowserRecord();
      record.attach(page);
      // Collect CSP violations from the page itself (a real browser event, not an interception).
      await page.addInitScript(() => {
        const w = window as unknown as { __atlasCsp: string[] };
        w.__atlasCsp = [];
        document.addEventListener("securitypolicyviolation", (e) =>
          w.__atlasCsp.push(`${e.violatedDirective} ${e.blockedURI}`),
        );
      });
      await use(record);
      await record.settled();
      const csp = await page
        .evaluate(() => (window as unknown as { __atlasCsp?: string[] }).__atlasCsp ?? [])
        .catch(() => []);
      expect(csp, "CSP violations").toEqual([]);
      expect(record.pageErrors.map(String), "uncaught page errors").toEqual([]);
      expect(record.unexpectedConsole(), "browser console errors/warnings").toEqual([]);
      expect(
        record.responses.flatMap((r) => contract.check(r)),
        "API responses vs contract-v0.1.0",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { contract, expect };
