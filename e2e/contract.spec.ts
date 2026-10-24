// Contract conformance and specs-lock parity against the running backend (ATLAS-001 AC-02, AC-03, AC-08).
// The fixture validates every API response the browser receives; this spec also makes sure every released
// operation and each status the stack can produce was actually observed and checked.
import { contract, expect, test } from "./support/fixtures";
import { StatusPage, readSpecsLock } from "./support/pages";
import { API_BASE_URL, WEB_ORIGIN } from "./support/config";

test("specs.lock parity: the backend runs the same released specs commit (AC-02)", async ({ request }) => {
  const lock = readSpecsLock();
  const response = await request.get(`${API_BASE_URL}/api/v1/diagnostics/build`);
  expect(response.status()).toBe(200);
  const build = (await response.json()) as { specs_sha: string; contract_version: string };
  expect(build.specs_sha, "frontend specs.lock vs backend /diagnostics/build specs_sha").toBe(
    lock.specs_commit,
  );
  expect(build.contract_version).toBe(lock.contract_version);
});

test("every released operation and observed status conforms to contract-v0.1.0", async ({
  page,
  record,
  stack,
}) => {
  record.allowFailedApiRequests();
  const status = new StatusPage(page);
  await status.open(); // 200 x 3
  await status.expectSummary("Ready");
  await stack.down("database"); // ready 503
  await status.checkAgainAndWait();
  await status.expectSummary("Degraded");
  await stack.up("database");
  await stack.upstream("diagnostics-disabled"); // build 404
  await status.checkAgainAndWait();
  await status.expectSummary("Ready, diagnostics disabled");

  await record.settled();
  const seen = new Set(record.responses.map((r) => `${new URL(r.url).pathname} ${r.status}`));
  expect([...seen].sort()).toEqual([
    "/api/v1/diagnostics/build 200",
    "/api/v1/diagnostics/build 404",
    "/api/v1/health/live 200",
    "/api/v1/health/ready 200",
    "/api/v1/health/ready 503",
  ]);
  expect(contract.operations.sort()).toEqual(["getDiagnosticsBuild", "getHealthLive", "getHealthReady"]);
  expect(record.responses.flatMap((r) => contract.check(r))).toEqual([]);
});

test("the conformance check itself rejects a non-conforming response", () => {
  const ok = {
    url: `${API_BASE_URL}/api/v1/health/live`,
    method: "GET",
    status: 200,
    headers: { "content-type": "application/json", "x-correlation-id": "web_0000000000" },
    requestCorrelationId: "web_0000000000",
    body: JSON.stringify({ status: "ok" }),
  };
  expect(contract.check(ok)).toEqual([]);
  expect(contract.check({ ...ok, body: JSON.stringify({ status: 5 }) })).not.toEqual([]);
  expect(contract.check({ ...ok, body: JSON.stringify({}) })).not.toEqual([]);
  expect(contract.check({ ...ok, body: "<html>" })).not.toEqual([]);
  expect(contract.check({ ...ok, status: 201 })).not.toEqual([]);
  expect(contract.check({ ...ok, headers: { ...ok.headers, "x-correlation-id": "<script>" } })).not.toEqual(
    [],
  );
  expect(contract.check({ ...ok, url: `${API_BASE_URL}/api/v1/health/other` })).not.toEqual([]);
});

test("API responses carry the security baseline and honour the CORS allowlist (AC-12)", async ({
  request,
}) => {
  const url = `${API_BASE_URL}/api/v1/health/live`;
  const allowed = await request.get(url, { headers: { Origin: WEB_ORIGIN } });
  expect(allowed.headers()["access-control-allow-origin"]).toBe(WEB_ORIGIN);
  expect(allowed.headers()["x-content-type-options"]).toBe("nosniff");
  expect(allowed.headers()["referrer-policy"]).toBe("no-referrer");
  expect(allowed.headers()["cache-control"]).toContain("no-store");
  const other = await request.get(url, { headers: { Origin: "http://other.example" } });
  expect(other.headers()["access-control-allow-origin"]).toBeUndefined();
  // Invalid inbound correlation IDs are replaced, never echoed (AC-10).
  for (const bad of ["<script>", "x".repeat(200)]) {
    const response = await request.get(url, { headers: { "X-Correlation-ID": bad } });
    expect(response.headers()["x-correlation-id"]).not.toBe(bad);
    expect(response.headers()["x-correlation-id"]).toMatch(contract.correlationPattern);
  }
});
