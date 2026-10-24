import { AtlasApiError } from "@/lib/api/errors";
import type { BuildInfo } from "@/lib/api/transport";

import { deriveStatus, type QueryOutcome } from "./derive";

const BUILD: BuildInfo = {
  backend_sha: "a".repeat(40),
  specs_sha: "b".repeat(40),
  contract_version: "0.1.0",
  db_migration_revision: "0001_baseline",
  environment: "local",
};
const ok = <T>(data: T): QueryOutcome<T> => ({ data, pending: false });
const fail = (
  code: string,
  status: number | null,
  details: Record<string, unknown> = {},
): QueryOutcome<never> => ({
  error: new AtlasApiError({ code, message: "m", status, correlationId: `cid_${code}`, details }),
  pending: false,
});
const LIVE = ok({ status: "ok" as const });
const READY = ok({ status: "ok" as const, checks: { database: "ok" as const, redis: "ok" as const } });

describe("deriveStatus", () => {
  it("loading while any query is pending", () => {
    expect(deriveStatus({ pending: true }, READY, ok(BUILD)).state).toBe("loading");
  });

  it("ready when every check is ok", () => {
    const m = deriveStatus(LIVE, READY, ok(BUILD));
    expect(m).toMatchObject({
      state: "ready",
      checks: { api: "ok", database: "ok", redis: "ok" },
      build: BUILD,
    });
  });

  it.each(["database", "redis"])("degraded naming the failed check (%s)", (failed) => {
    const m = deriveStatus(LIVE, fail("DEPENDENCY_UNAVAILABLE", 503, { failed_check: failed }), ok(BUILD));
    expect(m.state).toBe("degraded");
    expect(m.checks[failed as "database" | "redis"]).toBe("failed");
    expect(m.correlationId).toBe("cid_DEPENDENCY_UNAVAILABLE");
  });

  it("unreachable on any network failure, with nothing claimed healthy", () => {
    const m = deriveStatus(
      fail("NETWORK_UNAVAILABLE", null),
      fail("NETWORK_UNAVAILABLE", null),
      fail("NETWORK_UNAVAILABLE", null),
    );
    expect(m).toMatchObject({
      state: "unreachable",
      checks: { api: "unknown", database: "unknown", redis: "unknown" },
    });
  });

  it("diagnostics-disabled when build info is 404", () => {
    const m = deriveStatus(LIVE, READY, fail("NOT_FOUND", 404));
    expect(m).toMatchObject({
      state: "diagnostics-disabled",
      build: null,
      checks: { database: "ok", redis: "ok" },
    });
  });

  it.each([
    ["live fails", fail("INTERNAL_ERROR", 500), READY, ok(BUILD)],
    ["ready fails unexpectedly", LIVE, fail("UNEXPECTED_RESPONSE", 502), ok(BUILD)],
    ["build fails unexpectedly", LIVE, READY, fail("INTERNAL_ERROR", 500)],
    ["a non-API error", { error: new Error("boom"), pending: false }, READY, ok(BUILD)],
  ])("error when %s", (_, live, ready, build) => {
    const m = deriveStatus(
      live as QueryOutcome<never>,
      ready as QueryOutcome<never>,
      build as QueryOutcome<BuildInfo>,
    );
    expect(m.state).toBe("error");
    expect(m.errorCode).toBeTruthy();
  });

  it("degraded wins over diagnostics-disabled", () => {
    const m = deriveStatus(
      LIVE,
      fail("DEPENDENCY_UNAVAILABLE", 503, { failed_check: "database" }),
      fail("NOT_FOUND", 404),
    );
    expect(m.state).toBe("degraded");
  });
});
