/**
 * The only module that knows the API base URL (ATLAS-001 FR-52). Typed by the generated contract
 * (src/generated/api) through openapi-fetch. Each request carries a fresh X-Correlation-ID. Failures map to
 * AtlasApiError: the error envelope -> its code; a non-JSON or malformed body -> UNEXPECTED_RESPONSE; no
 * response at all -> NETWORK_UNAVAILABLE. Response bodies are never rendered as HTML.
 */
import createClient from "openapi-fetch";

import type { components, paths } from "@/generated/api/schema";
import { getEnv } from "@/lib/env";

import { CORRELATION_HEADER, CORRELATION_PATTERN, newCorrelationId } from "./correlation";
import { AtlasApiError, isErrorEnvelope } from "./errors";

type Schemas = components["schemas"];
export type HealthLive = Schemas["HealthLive"];
export type HealthReady = Schemas["HealthReady"];
export type BuildInfo = Schemas["BuildInfo"];

export interface ApiResult<T> {
  readonly data: T;
  readonly status: number;
  readonly correlationId: string;
}

type GetPath = { [P in keyof paths]: paths[P] extends { get: unknown } ? P : never }[keyof paths];

export interface Transport {
  getHealthLive(): Promise<ApiResult<HealthLive>>;
  getHealthReady(): Promise<ApiResult<HealthReady>>;
  getDiagnosticsBuild(): Promise<ApiResult<BuildInfo>>;
}

export function createTransport(
  baseUrl: string = getEnv().apiBaseUrl,
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
): Transport {
  const client = createClient<paths>({ baseUrl, fetch: fetchImpl });

  async function get<T>(path: GetPath): Promise<ApiResult<T>> {
    const sent = newCorrelationId();
    let response: Response;
    let raw: unknown;
    try {
      const result = await client.GET(path, {
        headers: { [CORRELATION_HEADER]: sent, Accept: "application/json" },
        parseAs: "text",
      });
      response = result.response;
      // Success bodies arrive as text (parseAs); openapi-fetch may already have parsed an error body.
      raw = result.data ?? result.error;
    } catch {
      throw new AtlasApiError({
        code: "NETWORK_UNAVAILABLE",
        message: "The Atlas API could not be reached.",
        status: null,
        correlationId: sent,
        recoverable: true,
      });
    }
    const echoed = response.headers.get(CORRELATION_HEADER);
    const correlationId = echoed && CORRELATION_PATTERN.test(echoed) ? echoed : sent;
    const isJson = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() === "application/json";
    let body: unknown = undefined;
    if (isJson && typeof raw === "string") {
      try {
        body = JSON.parse(raw) as unknown;
      } catch {
        body = undefined;
      }
    } else if (isJson && raw !== undefined) {
      body = raw;
    }
    if (response.ok && body !== undefined) {
      return { data: body as T, status: response.status, correlationId };
    }
    if (!response.ok && isErrorEnvelope(body)) {
      throw new AtlasApiError({
        code: body.error.code,
        message: body.error.message,
        status: response.status,
        correlationId: body.error.correlation_id,
        details: body.error.details,
        recoverable: body.error.recoverable,
      });
    }
    throw new AtlasApiError({
      code: "UNEXPECTED_RESPONSE",
      message: `The Atlas API returned an unexpected ${isJson ? "body" : "non-JSON response"} (HTTP ${response.status}).`,
      status: response.status,
      correlationId,
      recoverable: true,
    });
  }

  return {
    getHealthLive: () => get<HealthLive>("/api/v1/health/live"),
    getHealthReady: () => get<HealthReady>("/api/v1/health/ready"),
    getDiagnosticsBuild: () => get<BuildInfo>("/api/v1/diagnostics/build"),
  };
}
