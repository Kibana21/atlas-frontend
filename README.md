# atlas-frontend

Atlas web application: Next.js (App Router) + React + strict TypeScript, Tailwind CSS on the Atlas design
tokens, TanStack Query, and an API client generated from the released contract (`contract-v0.1.0`).

ATLAS-001 scope: the bright application shell, a placeholder home page and `/status`. Product screens
(canvas, Studio, Explore, Intelligence) arrive in later work items.

## Toolchain (project-local, pinned)

| Tool    | Version         | Where it comes from                                                                                                                                                                                         |
| ------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js | `24.22.1` (LTS) | `.nvmrc` + `package.json` `engines` (`engine-strict`). `scripts/bootstrap-node.sh` installs it into the git-ignored `.tools/` and verifies the official SHA-256 checksum. Your global Node is never touched |
| pnpm    | `11.28.5`       | `package.json` `packageManager` (Corepack, hash-verified). Lockfile `pnpm-lock.yaml` is committed                                                                                                           |

```bash
scripts/bootstrap-node.sh            # once: Node from .nvmrc into .tools/
source scripts/dev-env.sh            # each shell: project Node and pnpm first on PATH
corepack enable pnpm --install-directory "$PWD/.tools/node/bin"   # once: pnpm shim inside .tools/
pnpm install --frozen-lockfile
```

nvm or fnm users can run `nvm use` / `fnm use` instead (same `.nvmrc`). The supply-chain rules live in
`pnpm-workspace.yaml`: releases must be 14 days old (exceptions only for recorded security fixes), and
dependency install scripts are denied.

## Configuration

Copy `.env.example` to `.env.local` (git-ignored). Both values are **public** and compiled into the bundle:

| Variable                         | Example                 | Rule                                                                                                                                                          |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_ATLAS_API_BASE_URL` | `http://127.0.0.1:8100` | Required. Absolute http(s) URL, no credentials, query or fragment. The local backend usually runs on 8100 or 8101 (`make api API_PORT=8100` in atlas-backend) |
| `NEXT_PUBLIC_ATLAS_FRONTEND_SHA` | `unknown`               | Optional. Full 40-hex commit SHA (CI and images set it)                                                                                                       |

An invalid value stops `pnpm dev` and `pnpm build` with a clear message. The backend must allow the
frontend origin (`ATLAS_CORS_ORIGINS=http://localhost:3000` in its `.env`).

## Running locally

```bash
pnpm dev                     # http://localhost:3000 (hot reload)
pnpm build && pnpm start     # production server on :3000 (security headers and CSP as in production)
```

`/` is the placeholder; `/status` shows readiness and build provenance from the running backend.

## Contract and tokens

`specs.lock` pins the released `atlas-specs` commit, the same one as `atlas-backend/specs.lock`.

| Command                | What it does                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm specs`           | Validates `specs.lock` (full SHA, `contract-v*` release tag on that commit), extracts `contracts/` + `design/` at that SHA into `build/specs` (`SPECS_DIR` defaults to `../atlas-specs`) |
| `pnpm gen`             | `src/generated/api/schema.d.ts` (openapi-typescript) and `src/styles/tokens.generated.css` (CSS variables + Tailwind theme). Both carry a do-not-edit header                             |
| `pnpm check:generated` | Fails if a regeneration differs from the committed files (hand edits, or a pin change without `pnpm gen`)                                                                                |

Never hand-edit generated files or duplicate API schemas. The only module that knows the API base URL is
`src/lib/api/transport.ts`.

## Checks

| Command                  | What it does                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `pnpm check`             | `tsc` (strict), ESLint (`--max-warnings 0`, jsx-a11y), Prettier check, Vitest with coverage ≥ 80%   |
| `pnpm test`              | Unit, component and axe accessibility tests (jsdom)                                                 |
| `pnpm audit`             | Production dependencies, fails on high/critical                                                     |
| `scripts/image-check.sh` | Build the image; hadolint, Trivy, non-root and hardened-run checks; security headers; graceful stop |

CI (`.github/workflows/frontend-ci.yml`) runs `static`, `unit`, `generated`, `build`, `security`, `image` and
`e2e` on every PR and on `main`.

## End-to-end tests (Playwright, Chromium)

`pnpm e2e` runs the acceptance suite in real Chromium against the production build and the **real backend**:
two API processes (diagnostics enabled and disabled) and the Taskiq worker, started from an `atlas-backend`
checkout. Nothing in the browser is intercepted or mocked.

| Suite                       | Covers                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `e2e/status.spec.ts`        | healthy; database down → degraded → recovery; Redis down → recovery; API unreachable → recovery; diagnostics off                                 |
| `e2e/contract.spec.ts`      | `specs.lock` parity with the backend's `specs_sha`; every API response checked against the pinned contract; CORS                                 |
| `e2e/security.spec.ts`      | CSP (nonce, `strict-dynamic`, enforcement) and security headers on the served documents                                                          |
| `e2e/accessibility.spec.ts` | axe-core on every page state (contrast from rendered pixels), keyboard and skip link, live region, 320 px, 200 %, forced colours, reduced motion |
| `e2e/home.spec.ts`          | `/`: one heading, one working link                                                                                                               |

Every test also fails on any browser console error, uncaught page error or CSP violation it did not cause on purpose.

Outages are simulated by the suite's **own TCP proxies** (`e2e/support/fault-proxy.ts`) between the backend
and PostgreSQL/Redis, and between the browser and the backend. No PostgreSQL, Redis or other service is ever
stopped or reconfigured. Everything binds `127.0.0.1` (web :3000, API proxy :8110, backends :8111/:8112,
dependency proxies :15432/:15433/:16379/:16380, stack control :8119).

### Running it locally

Prerequisites: the backend checkout next to this one (`../atlas-backend`, or set `ATLAS_E2E_BACKEND_DIR`), set up as
in its README with `.env.test` (test roles, `atlas_test` migrated, Redis DB 11), and `uv` on `PATH`.

```bash
source scripts/dev-env.sh
pnpm exec playwright install chromium   # once: Chromium into .tools/ms-playwright (version pinned by @playwright/test)
pnpm specs                              # pinned contract for the response checks
pnpm e2e:build                          # production build that calls the E2E API proxy (rebuilds .next)
pnpm e2e                                # starts the backend stack, runs the suite, stops everything
pnpm exec playwright show-report        # HTML report (playwright-report/)
```

The suite refuses to start unless the backend settings are the **test** environment (`ATLAS_ENV=test`,
`atlas_test`, Redis DB 11; keys under `atlas:test:e2e:`). Connection URLs are read from `.env.test` (or `ATLAS_*`
variables) into memory, passed only to the backend processes, and never printed or written to disk. Process logs go
to `test-results/e2e-stack/` (git-ignored).

In CI, the `e2e` job checks out `atlas-backend` at the commit in `e2e/backend.ref` and runs against job-local
`postgres:15` and `redis:7.4` services with random, masked role passwords. It uploads the HTML report and stack logs
(after checking they contain no credential).

## Project structure

```text
src/app/                      routes: layout (shell), / (placeholder), /status; providers
src/components/shell/         AppShell (skip link, banner, main), EntitySpectrum
src/components/ui/            accessible primitives: Button, TextLink, Panel, StatusIndicator, icons
src/components/canvas/        (later: architecture canvas)
src/features/studio|explore|intelligence/   (later)
src/generated/api/            generated contract types: never edit
src/lib/                      env, api (transport, errors, correlation), query, status, security
src/styles/                   tokens.generated.css (never edit) + base.css
src/proxy.ts                  per-request CSP nonce and security headers
scripts/                      toolchain, specs, generation, header and image checks
tests/                        test setup, axe helper, repository hygiene tests
e2e/                          Playwright acceptance suite; support/ (stack, fault proxies, contract checks); backend.ref
```

## Docker image

```bash
docker build --build-arg NEXT_PUBLIC_ATLAS_API_BASE_URL=http://127.0.0.1:8100 \
  --build-arg NEXT_PUBLIC_ATLAS_FRONTEND_SHA="$(git rev-parse HEAD)" -t atlas-web .
docker run --rm -p 127.0.0.1:3000:3000 atlas-web
```

The image is built from the Next.js standalone output on a digest-pinned `node:24.22.1-trixie-slim` base. It runs as uid 10001 with npm, Corepack and Yarn removed, and works with a read-only root filesystem. On SIGTERM, Next.js shuts down cleanly and exits with 143. The API base URL is fixed at build time.

## Security

- **Content Security Policy:** a per-request nonce with `strict-dynamic`; no `unsafe-eval` and no inline scripts in production; `frame-ancestors 'none'`; `connect-src` limited to the API origin. Also `nosniff`, `no-referrer`, `X-Frame-Options: DENY`.
- **Safe rendering:** no raw HTML injection, `eval` or hard-coded colours. ESLint and the hygiene tests enforce this.
- **Public repository:** never commit secrets or private infrastructure details. `NEXT_PUBLIC_*` values are public by definition.
