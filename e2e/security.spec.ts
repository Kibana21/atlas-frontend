// Security headers and CSP as served by `next start` and enforced by Chromium (ATLAS-001 FR-57, AC-12).
import { API_BASE_URL } from "./support/config";
import { expect, test } from "./support/fixtures";

for (const path of ["/", "/status"]) {
  test(`${path}: nonce CSP and security headers on the document`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    const headers = (await response?.allHeaders()) ?? {};
    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'"]) {
      expect(csp).toContain(directive);
    }
    expect(csp).toMatch(new RegExp(`connect-src 'self' ${API_BASE_URL.replace(/[.]/g, "\\.")}(;|$)`));
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-powered-by"]).toBeUndefined();

    // Every script in the served HTML carries this response's nonce; none is inline without it.
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    const html = (await response?.text()) ?? "";
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
    // A fresh nonce per response.
    const again = await page.request.get(path);
    expect(again.headers()["content-security-policy"]).not.toBe(csp);
  });
}

test("Chromium enforces the CSP: injected inline event handlers do not run", async ({ page, record }) => {
  // The classic injection shape: markup with an inline handler. It carries no nonce, so Chromium must refuse
  // it. Note: with 'strict-dynamic' (the Next.js nonce model), scripts that already-trusted code creates are
  // trusted by design, so the defence against HTML injection is also that the app never renders raw HTML
  // (react/no-danger lint and the repository hygiene test).
  record.allowConsole(
    /^Executing inline event handler violates the following Content Security Policy directive/,
  );
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const w = window as unknown as { __atlasInjected?: boolean; __atlasCsp: string[] };
    const probe = document.createElement("div");
    probe.hidden = true;
    probe.innerHTML = '<img src="data:," onerror="window.__atlasInjected = true">';
    document.body.append(probe);
    await new Promise((r) => setTimeout(r, 200));
    probe.remove();
    const violations = [...w.__atlasCsp];
    w.__atlasCsp.length = 0; // expected; the fixture still fails on any other violation
    return { ran: w.__atlasInjected === true, violations };
  });
  expect(result.ran).toBe(false);
  expect(result.violations.some((v) => v.startsWith("script-src"))).toBe(true);
});
