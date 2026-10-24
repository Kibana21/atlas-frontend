import type { components } from "@/generated/api/schema";

export type ErrorEnvelope = components["schemas"]["ErrorEnvelope"];
/** Codes the backend can send (append-only catalog; see the contract) or that the client assigns itself. */
export type ClientErrorCode = "NETWORK_UNAVAILABLE" | "UNEXPECTED_RESPONSE";

export interface AtlasApiErrorInit {
  readonly code: string;
  readonly message: string;
  /** HTTP status, or null when no response arrived. */
  readonly status: number | null;
  /** The request's correlation ID (server-confirmed when a response arrived). */
  readonly correlationId: string;
  readonly details?: Record<string, unknown>;
  readonly recoverable?: boolean;
}

/** Every failed API call surfaces as this one typed error (ATLAS-001 FR-52). */
export class AtlasApiError extends Error {
  override readonly name = "AtlasApiError";
  readonly code: string;
  readonly status: number | null;
  readonly correlationId: string;
  readonly details: Record<string, unknown>;
  readonly recoverable: boolean;

  constructor(init: AtlasApiErrorInit) {
    super(init.message);
    this.code = init.code;
    this.status = init.status;
    this.correlationId = init.correlationId;
    this.details = init.details ?? {};
    this.recoverable = init.recoverable ?? false;
  }
}

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  if (typeof error !== "object" || error === null) return false;
  const e = error as Record<string, unknown>;
  return (
    typeof e.code === "string" &&
    typeof e.message === "string" &&
    typeof e.correlation_id === "string" &&
    typeof e.recoverable === "boolean" &&
    typeof e.details === "object" &&
    e.details !== null
  );
}
