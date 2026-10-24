import { STATIC_SECURITY_HEADERS, buildCsp, newNonce } from "./headers";

describe("content security policy", () => {
  const production = buildCsp({ nonce: "abc123==", apiOrigin: "http://127.0.0.1:8100", development: false });

  it("has no unsafe-eval or unsafe-inline in production", () => {
    expect(production).not.toContain("unsafe-eval");
    expect(production).not.toContain("unsafe-inline");
  });

  it("uses the nonce with strict-dynamic and locks down framing, objects and base URI", () => {
    expect(production).toContain("script-src 'self' 'nonce-abc123==' 'strict-dynamic'");
    expect(production).toContain("frame-ancestors 'none'");
    expect(production).toContain("object-src 'none'");
    expect(production).toContain("base-uri 'none'");
    expect(production).toContain("connect-src 'self' http://127.0.0.1:8100");
    expect(production).not.toMatch(/https?:\/\/(?!127\.0\.0\.1:8100)/); // no external origins besides the API
  });

  it("allows eval and websockets only in development", () => {
    const dev = buildCsp({ nonce: "n", apiOrigin: "http://127.0.0.1:8100", development: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws:");
  });

  it("sends nosniff, no-referrer and denies framing", () => {
    const headers = Object.fromEntries(STATIC_SECURITY_HEADERS);
    expect(headers).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
    });
  });

  it("creates a fresh base64 nonce per call", () => {
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(newNonce()).not.toBe(a);
  });
});
