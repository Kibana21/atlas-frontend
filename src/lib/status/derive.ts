/**
 * Status page model (ATLAS-001 FR-56): one of six distinct states, derived only from real API results.
 * Unknown stays unknown: nothing is shown as healthy unless the API said so.
 */
import { AtlasApiError } from "@/lib/api/errors";
import type { BuildInfo, HealthLive, HealthReady } from "@/lib/api/transport";

export type StatusState = "loading" | "ready" | "degraded" | "unreachable" | "diagnostics-disabled" | "error";
export type CheckState = "ok" | "failed" | "unknown";

export interface QueryOutcome<T> {
  readonly data?: T | undefined;
  readonly error?: unknown;
  readonly pending: boolean;
}

export interface StatusModel {
  readonly state: StatusState;
  readonly checks: { readonly api: CheckState; readonly database: CheckState; readonly redis: CheckState };
  readonly build: BuildInfo | null;
  /** Correlation ID of the failing request (error and degraded states), for support. */
  readonly correlationId: string | null;
  readonly errorCode: string | null;
}

function apiError(error: unknown): AtlasApiError | null {
  return error instanceof AtlasApiError ? error : null;
}

export function deriveStatus(
  live: QueryOutcome<HealthLive>,
  ready: QueryOutcome<HealthReady>,
  build: QueryOutcome<BuildInfo>,
): StatusModel {
  const errors = [live.error, ready.error, build.error].map(apiError);
  const unknownChecks = { api: "unknown", database: "unknown", redis: "unknown" } as const;
  if (live.pending || ready.pending || build.pending) {
    return { state: "loading", checks: unknownChecks, build: null, correlationId: null, errorCode: null };
  }
  const network = errors.find((e) => e?.code === "NETWORK_UNAVAILABLE");
  if (network) {
    return {
      state: "unreachable",
      checks: unknownChecks,
      build: null,
      correlationId: network.correlationId,
      errorCode: network.code,
    };
  }
  const [liveError, readyError, buildError] = errors;
  const otherError = [live.error, ready.error, build.error].find(
    (e) => e !== undefined && apiError(e) === null,
  );
  const unexpected =
    liveError ??
    (readyError && readyError.code !== "DEPENDENCY_UNAVAILABLE" ? readyError : null) ??
    (buildError && buildError.code !== "NOT_FOUND" ? buildError : null);
  if (unexpected || otherError !== undefined) {
    return {
      state: "error",
      checks: {
        api: liveError ? "failed" : live.data ? "ok" : "unknown",
        database: "unknown",
        redis: "unknown",
      },
      build: build.data ?? null,
      correlationId: unexpected?.correlationId ?? null,
      errorCode: unexpected?.code ?? "UNEXPECTED_RESPONSE",
    };
  }
  const buildInfo = build.data ?? null;
  if (readyError) {
    const failed = readyError.details.failed_check;
    return {
      state: "degraded",
      checks: {
        api: "ok",
        database: failed === "database" ? "failed" : "unknown",
        redis: failed === "redis" ? "failed" : "unknown",
      },
      build: buildInfo,
      correlationId: readyError.correlationId,
      errorCode: readyError.code,
    };
  }
  const checks = {
    api: "ok",
    database: ready.data?.checks.database === "ok" ? "ok" : "unknown",
    redis: ready.data?.checks.redis === "ok" ? "ok" : "unknown",
  } as const;
  if (buildError) {
    return {
      state: "diagnostics-disabled",
      checks,
      build: null,
      correlationId: null,
      errorCode: buildError.code,
    };
  }
  return { state: "ready", checks, build: buildInfo, correlationId: null, errorCode: null };
}
