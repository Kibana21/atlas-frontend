import { NextRequest } from "next/server";

import { config, proxy } from "./proxy";

describe("proxy", () => {
  it("sets a per-request CSP nonce and the security headers", () => {
    const first = proxy(new NextRequest("http://localhost:3000/status"));
    const second = proxy(new NextRequest("http://localhost:3000/status"));
    const csp = first.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("connect-src 'self' http://127.0.0.1:8100");
    expect(csp).not.toBe(second.headers.get("content-security-policy"));
    expect(first.headers.get("x-content-type-options")).toBe("nosniff");
    expect(first.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("skips static assets", () => {
    expect(config.matcher[0]?.source).toContain("_next/static");
  });
});
