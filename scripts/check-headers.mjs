// Scripted header assertion for a running production server (ATLAS-001 F-08, AC-12):
//   node scripts/check-headers.mjs http://127.0.0.1:3000
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const failures = [];
for (const path of ["/", "/status"]) {
  const response = await fetch(base + path, { redirect: "manual" });
  const csp = response.headers.get("content-security-policy") ?? "";
  const expect = (ok, message) => ok || failures.push(`${path}: ${message}`);
  expect(response.status === 200, `status ${response.status}`);
  expect(csp.length > 0, "no Content-Security-Policy");
  expect(!csp.includes("unsafe-eval"), "CSP allows unsafe-eval");
  expect(!/script-src[^;]*unsafe-inline/.test(csp), "CSP allows inline scripts");
  expect(
    /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/.test(csp),
    "script-src is not nonce-based",
  );
  expect(csp.includes("frame-ancestors 'none'"), "frame-ancestors is not 'none'");
  expect(response.headers.get("x-content-type-options") === "nosniff", "missing nosniff");
  expect(response.headers.get("referrer-policy") === "no-referrer", "missing no-referrer");
  expect(!response.headers.has("x-powered-by"), "x-powered-by exposed");
  const html = await response.text();
  for (const tag of html.match(/<script\b[^>]*>/g) ?? []) {
    expect(/\bnonce="[^"]+"/.test(tag), `script without nonce: ${tag.slice(0, 60)}`);
  }
}
if (failures.length > 0) {
  console.error(`HEADERS_INVALID:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `OK: CSP (nonce, strict-dynamic, no unsafe-eval/inline scripts, frame-ancestors 'none'), nosniff, no-referrer on / and /status`,
);
