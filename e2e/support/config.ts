// Shared E2E settings (ATLAS-001 F-10/F-12). Every listener binds 127.0.0.1 only.
export const HOST = "127.0.0.1";

export const PORTS = {
  web: 3000, // `next start` (package.json "start")
  api: 8110, // fault proxy in front of the backend: the API URL compiled into the E2E build
  apiPrimary: 8111, // backend API, diagnostics enabled
  apiNoDiagnostics: 8112, // backend API, diagnostics disabled (AC-09, AC-15 d)
  database: 15432, // fault proxy in front of PostgreSQL (primary API and worker)
  redis: 16379, // fault proxy in front of Redis (primary API and worker)
  databaseSteady: 15433, // pass-through proxies for the diagnostics-disabled API: never taken down, so
  redisSteady: 16380, //    an outage drill on the primary leaves no stale connections in that process
  control: 8119, // stack control API used by the tests
} as const;

export const WEB_ORIGIN = `http://${HOST}:${PORTS.web}`;
export const API_BASE_URL = `http://${HOST}:${PORTS.api}`;
export const CONTROL_URL = `http://${HOST}:${PORTS.control}`;

/** Where the stack writes process logs and its state (git-ignored; uploaded by CI on failure). */
export const STACK_DIR = "test-results/e2e-stack";

export type Fault = "database" | "redis" | "api";
export type ApiUpstream = "primary" | "diagnostics-disabled";
export type Service = "api-primary" | "api-no-diagnostics" | "worker";
