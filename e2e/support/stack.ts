// The E2E stack (ATLAS-001 F-10/F-12): the real backend (two API processes and the Taskiq worker) from an
// atlas-backend checkout, behind fault proxies, plus a small control API for the tests.
//
// Safety (spec NFR-06, owner CP7 §2):
// - test environment only (ATLAS_ENV=test: atlas_test, Redis DB 11, `atlas:test:` prefix; the backend's own
//   settings guards enforce the combination); its own key prefix `atlas:test:e2e:`;
// - outages are simulated by this stack's own proxies; no real service is ever stopped or reconfigured;
// - connection URLs (which hold credentials) are kept in memory and passed to child processes only; they
//   are never printed, logged or written to disk.
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { resolve } from "node:path";

import {
  CONTROL_URL,
  HOST,
  PORTS,
  STACK_DIR,
  WEB_ORIGIN,
  type ApiUpstream,
  type Fault,
  type Service,
} from "./config";
import { FaultProxy, type Endpoint } from "./fault-proxy";

const START_TIMEOUT_MS = 90_000;
const STOP_TIMEOUT_MS = 15_000;
const SETTINGS = [
  "ATLAS_ENV",
  "ATLAS_DATABASE_URL",
  "ATLAS_MIGRATION_DATABASE_URL",
  "ATLAS_DB_APP_ROLE",
  "ATLAS_REDIS_URL",
] as const;

type Settings = Record<(typeof SETTINGS)[number], string>;

class StackError extends Error {}

/** Minimal dotenv reader for the backend's git-ignored `.env.test` (KEY=VALUE lines only). */
function readEnvFile(path: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m?.[1] && m[2] !== undefined) values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

/** Backend settings from ATLAS_* variables (CI) or the backend's `.env.test` (local). */
function backendSettings(backendDir: string): Settings {
  const fromEnv = SETTINGS.every((key) => process.env[key]);
  const file = process.env.ATLAS_E2E_BACKEND_ENV_FILE ?? resolve(backendDir, ".env.test");
  if (!fromEnv && !existsSync(file)) {
    throw new StackError(`no backend settings: set ATLAS_* variables or create ${file} (backend README)`);
  }
  const source = fromEnv ? process.env : readEnvFile(file);
  const settings = {} as Settings;
  for (const key of SETTINGS) {
    const value = source[key];
    if (!value) throw new StackError(`backend setting ${key} is missing`);
    settings[key] = value;
  }
  if (settings.ATLAS_ENV !== "test") {
    throw new StackError(
      `E2E runs only against the backend test environment, got ATLAS_ENV=${settings.ATLAS_ENV}`,
    );
  }
  return settings;
}

function endpointOf(url: string, defaultPort: number): Endpoint {
  const u = new URL(url);
  return { host: u.hostname.replace(/^\[|\]$/g, ""), port: u.port ? Number(u.port) : defaultPort };
}

/** The same URL (credentials, database, options) with host and port replaced by a local proxy. */
function viaProxy(url: string, port: number): string {
  const u = new URL(url);
  u.hostname = HOST;
  u.port = String(port);
  return u.toString();
}

async function waitFor(what: string, check: () => Promise<boolean> | boolean, timeoutMs = START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (
      await Promise.resolve()
        .then(check)
        .catch(() => false)
    )
      return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new StackError(`timed out after ${timeoutMs / 1000} s waiting for ${what} (logs: ${STACK_DIR}/)`);
}

async function httpStatus(url: string): Promise<number> {
  const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
  await response.arrayBuffer();
  return response.status;
}

interface Managed {
  readonly name: Service;
  readonly child: ChildProcess;
  readonly logFile: string;
  exit: { code: number | null; signal: NodeJS.Signals | null } | null;
}

export class Stack {
  readonly #backendDir: string;
  readonly #settings: Settings;
  readonly #processes = new Map<Service, Managed>();
  readonly #proxies: Record<Fault, FaultProxy>;
  readonly #steady: FaultProxy[];
  #upstream: ApiUpstream = "primary";
  #control: http.Server | null = null;
  #stopping = false;

  constructor() {
    this.#backendDir = resolve(process.env.ATLAS_E2E_BACKEND_DIR ?? "../atlas-backend");
    if (!existsSync(resolve(this.#backendDir, "pyproject.toml"))) {
      throw new StackError(`atlas-backend checkout not found at ${this.#backendDir} (ATLAS_E2E_BACKEND_DIR)`);
    }
    this.#settings = backendSettings(this.#backendDir);
    const listen = (port: number): Endpoint => ({ host: HOST, port });
    this.#proxies = {
      database: new FaultProxy(
        "database",
        listen(PORTS.database),
        endpointOf(this.#settings.ATLAS_DATABASE_URL, 5432),
      ),
      redis: new FaultProxy("redis", listen(PORTS.redis), endpointOf(this.#settings.ATLAS_REDIS_URL, 6379)),
      api: new FaultProxy("api", listen(PORTS.api), listen(PORTS.apiPrimary)),
    };
    this.#steady = [
      new FaultProxy("database-steady", listen(PORTS.databaseSteady), this.#proxies.database.upstream),
      new FaultProxy("redis-steady", listen(PORTS.redisSteady), this.#proxies.redis.upstream),
    ];
  }

  #env(diagnostics: boolean, steady = false): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(process.env)) if (!key.startsWith("ATLAS_")) env[key] = value;
    return {
      ...env,
      ATLAS_ENV_FILE: "/nonexistent", // every setting below is explicit; no dotenv file is read
      ATLAS_ENV: "test",
      ATLAS_DATABASE_URL: viaProxy(
        this.#settings.ATLAS_DATABASE_URL,
        steady ? PORTS.databaseSteady : PORTS.database,
      ),
      ATLAS_MIGRATION_DATABASE_URL: this.#settings.ATLAS_MIGRATION_DATABASE_URL, // required; unused by API/worker
      ATLAS_DB_APP_ROLE: this.#settings.ATLAS_DB_APP_ROLE,
      ATLAS_REDIS_URL: viaProxy(this.#settings.ATLAS_REDIS_URL, steady ? PORTS.redisSteady : PORTS.redis),
      ATLAS_REDIS_KEY_PREFIX: "atlas:test:e2e:",
      ATLAS_CORS_ORIGINS: WEB_ORIGIN,
      ATLAS_DIAGNOSTICS_ENABLED: diagnostics ? "true" : "false",
      ATLAS_LOG_LEVEL: "INFO",
      ...(process.env.ATLAS_BUILD_SHA ? { ATLAS_BUILD_SHA: process.env.ATLAS_BUILD_SHA } : {}),
    };
  }

  #spawn(name: Service, args: string[], env: Record<string, string | undefined>): void {
    const logFile = resolve(STACK_DIR, `${name}.log`);
    const log = createWriteStream(logFile, { flags: "w" });
    const child: ChildProcess = spawn("uv", ["run", "--quiet", "--locked", ...args], {
      cwd: this.#backendDir,
      env: env as NodeJS.ProcessEnv,
      detached: true, // own process group, so stop() reaches uv and the Python process behind it
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    const managed: Managed = { name, child, logFile, exit: null };
    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      managed.exit = { code, signal };
      if (!this.#stopping)
        console.error(`[e2e-stack] ${name} exited unexpectedly (code ${code}, signal ${signal})`);
    });
    this.#processes.set(name, managed);
  }

  /** Lines of one service's log that are JSON events carrying this correlation ID. */
  logEvents(service: Service, correlationId: string): Array<Record<string, unknown>> {
    const managed = this.#processes.get(service);
    if (!managed) return [];
    return readFileSync(managed.logFile, "utf8")
      .split("\n")
      .filter((line) => line.includes(correlationId))
      .flatMap((line) => {
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          return event.correlation_id === correlationId ? [event] : [];
        } catch {
          return [];
        }
      });
  }

  #logContains(service: Service, text: string): boolean {
    const managed = this.#processes.get(service);
    return managed ? readFileSync(managed.logFile, "utf8").includes(text) : false;
  }

  state() {
    return {
      upstream: this.#upstream,
      faults: Object.fromEntries(Object.entries(this.#proxies).map(([k, p]) => [k, p.up ? "up" : "down"])),
      processes: Object.fromEntries(
        [...this.#processes.values()].map((m) => [m.name, m.exit ? { exited: m.exit } : { running: true }]),
      ),
    };
  }

  async setFault(target: Fault, state: "up" | "down"): Promise<void> {
    await (state === "up" ? this.#proxies[target].start() : this.#proxies[target].stop());
  }

  setUpstream(name: ApiUpstream): void {
    this.#upstream = name;
    this.#proxies.api.retarget({
      host: HOST,
      port: name === "primary" ? PORTS.apiPrimary : PORTS.apiNoDiagnostics,
    });
  }

  async reset(): Promise<void> {
    for (const target of ["database", "redis", "api"] as const) await this.setFault(target, "up");
    this.setUpstream("primary");
  }

  async start(): Promise<void> {
    mkdirSync(STACK_DIR, { recursive: true });
    for (const proxy of [...Object.values(this.#proxies), ...this.#steady]) await proxy.start();
    const api = ["uvicorn", "--factory", "atlas.main:create_app_from_env", "--host", HOST, "--no-access-log"];
    this.#spawn("api-primary", [...api, "--port", String(PORTS.apiPrimary)], this.#env(true));
    this.#spawn(
      "api-no-diagnostics",
      [...api, "--port", String(PORTS.apiNoDiagnostics)],
      this.#env(false, true),
    );
    this.#spawn(
      "worker",
      // the backend's `make worker` command line
      [
        "taskiq",
        "worker",
        "atlas.workers.entrypoint:broker",
        "--workers",
        "1",
        "--max-async-tasks",
        "10",
      ].concat(["--shutdown-timeout", "10", "--wait-tasks-timeout", "10"]),
      this.#env(true),
    );
    writeFileSync(
      resolve(STACK_DIR, "pids.json"),
      JSON.stringify([...this.#processes.values()].map((m) => m.child.pid)),
    );
    const alive = () => {
      for (const m of this.#processes.values()) {
        if (m.exit) throw new StackError(`${m.name} exited during startup (logs: ${m.logFile})`);
      }
    };
    for (const port of [PORTS.apiPrimary, PORTS.apiNoDiagnostics]) {
      await waitFor(
        `API on :${port}`,
        async () => (alive(), (await httpStatus(`http://${HOST}:${port}/api/v1/health/live`)) === 200),
      );
    }
    await waitFor("worker_started", () => (alive(), this.#logContains("worker", '"worker_started"')));
    // The real dependencies must answer through the proxies before any test runs.
    await waitFor(
      "readiness 200 through the proxies",
      async () => (await httpStatus(`http://${HOST}:${PORTS.api}/api/v1/health/ready`)) === 200,
      20_000,
    );
    await this.#serveControl();
  }

  async #serveControl(): Promise<void> {
    const server = http.createServer((req, res) => {
      void this.#handle(req, res).catch((error: unknown) => {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "control error" }));
      });
    });
    await new Promise<void>((r) => server.listen(PORTS.control, HOST, r));
    this.#control = server;
  }

  async #handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", CONTROL_URL);
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const [, action, a, b] = url.pathname.split("/");
    if (req.method === "GET" && action === "state") return send(200, this.state());
    if (req.method === "GET" && action === "logs" && a) {
      return send(200, this.logEvents(a as Service, url.searchParams.get("correlation_id") ?? "\u0000"));
    }
    if (req.method === "POST" && action === "fault" && (a === "database" || a === "redis" || a === "api")) {
      if (b !== "up" && b !== "down") return send(400, { error: "state must be up or down" });
      await this.setFault(a, b);
      return send(200, this.state());
    }
    if (req.method === "POST" && action === "upstream" && (a === "primary" || a === "diagnostics-disabled")) {
      this.setUpstream(a);
      return send(200, this.state());
    }
    if (req.method === "POST" && action === "reset") {
      await this.reset();
      return send(200, this.state());
    }
    send(404, { error: "unknown control route" });
  }

  /**
   * SIGTERM each top process (uv forwards it; taskiq stops its own worker child), wait for graceful exits,
   * SIGKILL any remaining process group, then record how each one stopped.
   */
  async stop(): Promise<Record<string, unknown>> {
    this.#stopping = true;
    await new Promise<void>((r) => (this.#control ? this.#control.close(() => r()) : r()));
    const running = [...this.#processes.values()].filter((m) => !m.exit && m.child.pid);
    const stopAt = Date.now();
    for (const m of running) m.child.kill("SIGTERM");
    const deadline = Date.now() + STOP_TIMEOUT_MS;
    while (Date.now() < deadline && running.some((m) => !m.exit))
      await new Promise((r) => setTimeout(r, 100));
    const stoppedIn = Date.now() - stopAt;
    for (const m of running) if (!m.exit) signalGroup(m.child.pid, "SIGKILL");
    // Nothing of the stack may outlive it: kill any leftover process in each group (no-op when clean).
    for (const m of this.#processes.values()) signalGroup(m.child.pid, "SIGKILL");
    for (const proxy of [...Object.values(this.#proxies), ...this.#steady]) await proxy.stop();
    const summary = {
      processes: Object.fromEntries(
        [...this.#processes.values()].map((m) => [m.name, m.exit ?? { killed: "SIGKILL after timeout" }]),
      ),
      worker_stopped_gracefully: this.#logContains("worker", '"worker_stopped"'),
      // uvicorn completes its lifespan shutdown (engine and Redis closed); the exit code is then 143 (signal).
      api_shutdown_complete: (["api-primary", "api-no-diagnostics"] as const).every((name) =>
        this.#logContains(name, "Application shutdown complete."),
      ),
      stopped_in_ms: stoppedIn,
    };
    writeFileSync(resolve(STACK_DIR, "shutdown.json"), JSON.stringify(summary, null, 2));
    return summary;
  }
}

function signalGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // already gone
  }
}
