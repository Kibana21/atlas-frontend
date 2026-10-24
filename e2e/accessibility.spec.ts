// Real-browser accessibility (ATLAS-001 AC-14, NFR-07; owner CP7 §3): axe-core in Chromium on every page
// state, keyboard-only use, visible focus, skip link, live announcements, reflow at 320 px, 200 % zoom
// (viewport equivalent, see below), forced colours and reduced motion. No axe rule is disabled.
import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures";
import { StatusPage } from "./support/pages";

const AXE_SOURCE = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

interface AxeNode {
  target: string[];
  failureSummary?: string;
}
interface AxeRule {
  id: string;
  impact: string | null;
  nodes: AxeNode[];
}
interface AxeResults {
  violations: AxeRule[];
  incomplete: AxeRule[];
  passes: AxeRule[];
}

/** Runs axe-core inside the page (page.evaluate is not subject to the page's CSP). */
async function axe(page: Page): Promise<AxeResults> {
  await page.evaluate(AXE_SOURCE);
  return page.evaluate(async (tags) => {
    const w = window as unknown as {
      axe: { run: (ctx: Document, opts: object) => Promise<AxeResults> };
    };
    const r = await w.axe.run(document, { runOnly: { type: "tag", values: [...tags, "best-practice"] } });
    const slim = (rules: AxeRule[]) =>
      rules.map((x) => ({
        id: x.id,
        impact: x.impact,
        nodes: x.nodes.map((n) => ({ target: n.target, failureSummary: n.failureSummary })),
      }));
    return { violations: slim(r.violations), incomplete: slim(r.incomplete), passes: slim(r.passes) };
  }, WCAG_TAGS);
}

/** WCAG contrast ratio of two sRGB colours. */
function ratio(a: number[], b: number[]): number {
  const lum = (c: number[]) => {
    const [r = 0, g = 0, bl = 0] = c.map((v) => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Contrast measured from rendered pixels, for text axe cannot decide because it sits on a gradient (the
 * dot-grid canvas behind the translucent header). The element's text is made transparent, the area behind
 * it is screenshotted, and the text colour is compared with EVERY background pixel (worst case).
 */
async function measuredContrast(page: Page, selector: string) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const info = await target.evaluate((el) => {
    const s = getComputedStyle(el);
    const rgb = (s.color.match(/[\d.]+/g) ?? []).map(Number);
    const saved = [el, ...el.querySelectorAll("*")].map((n) => {
      const h = n as HTMLElement;
      const before = h.style.getPropertyValue("color");
      h.style.setProperty("color", "transparent", "important");
      return [h, before] as const;
    });
    (window as unknown as { __atlasRestore: () => void }).__atlasRestore = () => {
      for (const [h, before] of saved) {
        if (before) h.style.setProperty("color", before);
        else h.style.removeProperty("color");
      }
    };
    return { rgb, size: parseFloat(s.fontSize), weight: Number(s.fontWeight) };
  });
  const box = await target.boundingBox();
  if (!box) throw new Error(`${selector}: not rendered`);
  const png = await page.screenshot({ clip: box, animations: "disabled" });
  await page.evaluate(() => (window as unknown as { __atlasRestore: () => void }).__atlasRestore());
  const decoder = await page.context().newPage();
  const pixels = await decoder.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const unique = new Set<string>();
    for (let i = 0; i < data.length; i += 4) unique.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return [...unique].map((c) => c.split(",").map(Number));
  }, png.toString("base64"));
  await decoder.close();
  const [r = 0, g = 0, b = 0, alpha = 1] = info.rgb;
  const large = info.size >= 24 || (info.size >= 18.66 && info.weight >= 700);
  const worst = Math.min(
    ...pixels.map((bg) => {
      const fg = [r, g, b].map((v, i) => v * alpha + (bg[i] ?? 0) * (1 - alpha));
      return ratio(fg, bg);
    }),
  );
  return {
    selector,
    ratio: Math.round(worst * 100) / 100,
    required: large ? 3 : 4.5,
    backgrounds: pixels.length,
  };
}

async function expectAccessible(page: Page, state: string): Promise<void> {
  // Scan the settled page: a running transition (e.g. "Check again" fading back from its busy opacity)
  // would make axe sample an intermediate colour.
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const results = await axe(page);
  await test.info().attach(`axe-${state}.json`, {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results.violations, `axe violations (${state})`).toEqual([]);
  // Contrast is computed from the rendered styles; it must actually have been evaluated.
  const contrast = results.passes.find((r) => r.id === "color-contrast");
  expect(contrast?.nodes.length ?? 0, `color-contrast evaluated (${state})`).toBeGreaterThan(0);
  // Nodes axe leaves for review (text over the gradient) are measured from pixels instead.
  const review = results.incomplete.filter((r) => r.id === "color-contrast").flatMap((r) => r.nodes);
  const measured = [];
  for (const node of review) {
    const selector = node.target.join(" ");
    expect(node.failureSummary, selector).toContain("background gradient");
    measured.push(await measuredContrast(page, selector));
  }
  await test.info().attach(`contrast-measured-${state}.json`, {
    body: JSON.stringify(measured, null, 2),
    contentType: "application/json",
  });
  for (const m of measured) expect(m.ratio, `${m.selector} (${state})`).toBeGreaterThanOrEqual(m.required);
}

async function focusRing(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      text: el.textContent?.trim() ?? "",
      style: s.outlineStyle,
      width: s.outlineWidth,
      offset: s.outlineOffset,
      color: s.outlineColor,
      visible: box.width > 1 && box.height > 1 && s.visibility !== "hidden",
    };
  });
}

/** A CSS colour value (token variable or system colour) as the browser resolves it. */
async function resolvedColour(page: Page, value: string): Promise<string> {
  return page.evaluate((v) => {
    const probe = document.createElement("span");
    probe.style.color = v;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, value);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("axe-core in Chromium: 0 violations, contrast from rendered styles", () => {
  test("home", async ({ page }) => {
    await page.goto("/");
    await expectAccessible(page, "home");
  });

  test("status: ready, degraded, unreachable, diagnostics disabled", async ({ page, record, stack }) => {
    record.allowFailedApiRequests();
    const status = new StatusPage(page);
    await status.open();
    await status.expectSummary("Ready");
    await expectAccessible(page, "status-ready");
    await stack.down("redis");
    await status.checkAgainAndWait();
    await status.expectSummary("Degraded");
    await expectAccessible(page, "status-degraded");
    await stack.up("redis");
    await stack.down("api");
    await status.checkAgainAndWait();
    await status.expectSummary("API unreachable");
    await expectAccessible(page, "status-unreachable");
    await stack.up("api");
    await stack.upstream("diagnostics-disabled");
    await status.checkAgainAndWait();
    await status.expectSummary("Ready, diagnostics disabled");
    await expectAccessible(page, "status-diagnostics-disabled");
  });
});

test.describe("keyboard only", () => {
  test("skip link, visible focus ring and every control operable from the keyboard", async ({ page }) => {
    await page.goto("/");
    const ring = await resolvedColour(page, "var(--atlas-color-focus-ring)");

    await page.keyboard.press("Tab");
    let focus = await focusRing(page);
    expect(focus).toMatchObject({
      text: "Skip to main content",
      style: "solid",
      width: "2px",
      offset: "2px",
      visible: true,
    });
    expect(focus.color).toBe(ring);
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("main");
    await expect(page).toHaveURL(/#main$/);

    await page.keyboard.press("Tab");
    focus = await focusRing(page);
    expect(focus).toMatchObject({
      text: "View system status",
      style: "solid",
      width: "2px",
      offset: "2px",
      visible: true,
    });
    expect(focus.color).toBe(ring);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/status$/);
    const status = new StatusPage(page);
    await status.expectSummary("Ready");

    // /status from a fresh load: skip link, Check again, Back to home; nothing else takes focus.
    await page.reload();
    await status.expectSummary("Ready");
    const focusable = await page
      .locator("a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])")
      .allTextContents();
    expect(focusable.map((t) => t.trim())).toEqual(["Skip to main content", "Check again", "Back to home"]);
    await page.keyboard.press("Tab");
    expect((await focusRing(page)).text).toBe("Skip to main content");
    await page.keyboard.press("Tab");
    focus = await focusRing(page);
    expect(focus).toMatchObject({ text: "Check again", style: "solid", width: "2px", visible: true });
    expect(focus.color).toBe(ring);

    // Space re-runs the checks; the keyboard user keeps their place on the button.
    const before = await page.getByText(/^Last checked /).textContent();
    await page.waitForTimeout(1100); // the timestamp has one-second resolution
    let settled = status.nextReadinessSettled();
    await page.keyboard.press("Space");
    await settled;
    await expect(page.getByText(/^Last checked /)).not.toHaveText(before ?? "");
    await status.expectIdle();
    await expect(status.checkAgain).toBeFocused();
    settled = status.nextReadinessSettled();
    await page.keyboard.press("Enter");
    await settled; // Enter really triggered a refetch
    await status.expectIdle();
    await expect(status.checkAgain).toBeFocused();

    await page.keyboard.press("Tab");
    expect((await focusRing(page)).text).toBe("Back to home");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/$/);
  });

  test("status changes are announced through the polite live region", async ({ page, record, stack }) => {
    record.allowFailedApiRequests();
    const status = new StatusPage(page);
    await status.open();
    await expect(status.liveRegion).toHaveAttribute("aria-live", "polite");
    await expect(status.liveRegion).toHaveText(
      "Status: Ready. The API, the database and Redis all responded.",
    );
    await stack.down("database");
    await status.checkAgain.focus();
    await page.keyboard.press("Enter");
    await expect(status.liveRegion).toHaveText(
      "Status: Degraded. The API is running, but the database did not respond in time.",
    );
    // Chromium exposes it to assistive technology as a status region with that text.
    await expect(page.getByRole("status")).toMatchAriaSnapshot(
      `- status: "Status: Degraded. The API is running, but the database did not respond in time."`,
    );
  });
});

test.describe("reflow and zoom", () => {
  for (const path of ["/", "/status"]) {
    test(`${path}: 320 CSS px wide without horizontal scrolling (WCAG 1.4.10)`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(path);
      if (path === "/status") await new StatusPage(page).expectSummary("Ready"); // longest content: SHAs
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      for (const name of ["Check again", "View system status"]) {
        const control = page.getByRole(path === "/" ? "link" : "button", { name });
        if ((await control.count()) === 0) continue;
        const box = await control.boundingBox();
        expect(box && box.x >= 0 && box.x + box.width <= 320).toBe(true);
      }
    });
  }

  test("200 % zoom: 1280x720 at 200 % = 640x360 CSS px at device scale 2 (WCAG 1.4.4)", async ({
    browser,
  }) => {
    // Chromium's page zoom has no automation API; zoom divides the CSS viewport by the zoom factor and
    // multiplies the device pixel ratio, which is exactly this emulation (media queries included).
    const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    for (const path of ["/", "/status"]) {
      await page.goto(path);
      expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
      if (path === "/status") await new StatusPage(page).expectSummary("Ready");
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    }
    await context.close();
  });
});

test("forced colours: focus ring and status text stay visible", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  const status = new StatusPage(page);
  await status.open();
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  await status.expectSummary("Ready");
  await expect(status.check("Database")).toContainText("Operational"); // text, not only colour
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const focus = await focusRing(page);
  expect(focus).toMatchObject({ text: "Check again", style: "solid", width: "2px", visible: true });
  expect(focus.color).toBe(await resolvedColour(page, "Highlight"));
  const icon = await page
    .locator(".atlas-icon")
    .first()
    .evaluate((el) => getComputedStyle(el).forcedColorAdjust);
  expect(icon).toBe("auto");
  const card = await status.check("API").evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.borderTopStyle, width: s.borderTopWidth };
  });
  expect(card).toEqual({ style: "solid", width: "1px" }); // card boundaries survive without backgrounds
});

test("reduced motion: every transition and animation is <= 0.01 ms", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/status"]) {
    await page.goto(path);
    const slowest = await page.evaluate(() => {
      const ms = (v: string) =>
        Math.max(
          ...v.split(",").map((d) => (d.trim().endsWith("ms") ? parseFloat(d) : parseFloat(d) * 1000)),
        );
      let max = 0;
      for (const el of document.querySelectorAll("*")) {
        for (const pseudo of [null, "::before", "::after"]) {
          const s = getComputedStyle(el, pseudo);
          max = Math.max(max, ms(s.transitionDuration), ms(s.animationDuration));
        }
      }
      return max;
    });
    expect(slowest, path).toBeLessThanOrEqual(0.01);
  }
});
