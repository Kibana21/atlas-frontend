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

CI (`.github/workflows/frontend-ci.yml`) runs `static`, `unit`, `generated`, `build`, `security` and `image`
on every PR and on `main`. Real-browser E2E (Playwright, Chromium) arrives in ATLAS-001 CP7.

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
