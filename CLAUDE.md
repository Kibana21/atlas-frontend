# atlas-frontend

Next.js web app for Atlas: the bright shell, the architecture canvas, and the Studio / Explore / Intelligence experiences. It owns presentation, canvas interaction, and client state. The backend owns identity, authorization, graph rules, reconciliation, validation, and persistence. **Never duplicate authoritative graph business rules in TypeScript.** Form validation is for UX only, and the backend revalidates every write.

Independent Git repo (`origin` = github.com/Kibana21/atlas-frontend, **public**). `atlas-specs` (sibling checkout `../atlas-specs`) is the authority:

- `ux/Atlas_Bright_UX_Interaction_Requirements_v1_1.md` (UX-* IDs, normative for behaviour);
- `technical/...v1_1.md` §5, §17.2;
- `features/ATLAS-001-engineering-foundation/spec.md` (FR-50…FR-59).

This file is self-sufficient. A workspace-level file may exist locally, but it is not versioned.

## Status

ATLAS-001 CP6 (F-01…F-09, plus the F-11 CI brought forward) is in place:

- **Toolchain:** project-local Node 24.22.1 and pnpm 11.28.5.
- **Generation:** contract types and tokens generated from the pinned `contract-v0.1.0`.
- **App:** shell, `/` placeholder, `/status` (six states), the transport, CSP and headers, the image, and CI.

CP7 (owner-authorized): Playwright E2E in Chromium against the real backend (`pnpm e2e`, F-10), the CI `e2e` job
(F-12, backend at `e2e/backend.ref`) and the README (F-13). The `v0.1.0` release tag follows only after G7 evidence.

## Commands

```bash
scripts/bootstrap-node.sh && source scripts/dev-env.sh   # project-local Node + pnpm (nothing global)
pnpm install --frozen-lockfile
pnpm dev                    # :3000; needs .env.local (copy .env.example; API usually :8100/:8101)
pnpm check                  # tsc strict, ESLint, Prettier, Vitest + axe, coverage >= 80 %
pnpm specs && pnpm gen      # extract the pinned specs, regenerate API types + tokens
pnpm check:generated        # drift check (CI `generated`)
pnpm build && pnpm start    # production server; node scripts/check-headers.mjs http://127.0.0.1:3000
scripts/image-check.sh      # image build, hadolint, Trivy, non-root, hardened run, headers, graceful stop
pnpm specs && pnpm e2e:build && pnpm e2e   # Chromium E2E vs the real backend (../atlas-backend, .env.test)
```

CI (`.github/workflows/frontend-ci.yml`) has the required checks `static`, `unit`, `generated`, `build`, `security`, `image` and `e2e`, on every PR and on `main`.

E2E rules: outages only through the suite's own proxies (`e2e/support/fault-proxy.ts`), never by stopping a real service; backend test environment only (`atlas_test`, Redis DB 11, `atlas:test:e2e:`); no `page.route(`, mocks or interception in `e2e/` (hygiene test).

Navigation stays minimal until product screens exist (FR-55; no dead controls): the shell has a skip link and the wordmark; `/` links only to `/status`.

## Workflow and approval boundaries

- Claude runs the whole workflow.
  1. Feature branch per approved task.
  2. Run the local gates from a **fresh clone** of the committed branch.
  3. Push, then open a PR to `main`.
  4. Wait until every required check reports success.
  5. Review the diff against the acceptance criteria.
  6. Merge with a merge commit and a head-SHA guard.
  7. Confirm `main` CI is green and record evidence in `atlas-specs`.
- Never force-push, push to `main`, bypass branch protection, or merge failing or missing checks.
- Owner approval is required for:
  - material architecture or product changes;
  - destructive actions;
  - shared-infrastructure changes;
  - privileged access or credentials;
  - significant cost or scope changes;
  - unresolved spec conflicts;
  - the next checkpoint or gate.
- **Specs authority:**
  - `specs.lock` pins the same full 40-hex `atlas-specs` SHA as the backend (ATLAS-001: the `contract-v0.1.0` commit).
  - Implement only approved scope.
  - If the contract or specs conflict, stop and report. Never patch around them here.
- **Public repo:**
  - Never commit secrets, tokens, credentials, confidential company or customer data, internal topology, or local-machine details (home paths, usernames).
  - Review the staged diff before every push.
- **Credentials:** never print credentials, and never forward `Authorization` headers to redirected storage or third-party hosts.
- **Local tooling:** use project-local, pinned tooling (Node version in `.nvmrc` + `engines`, `engine-strict`, committed `pnpm-lock.yaml`). Don't install tools globally or change the owner's Node installation without approval.
- **Evidence:** never claim tests or CI passed without the actual run, and never weaken tests to get a pass. ATLAS-001 is not Accepted before G7.

## Stack (§5.1; ATLAS-001 DEC-038/DEC-092)

Approved for ATLAS-001:

- Next.js App Router, React;
- TypeScript **strict** (+ `noUncheckedIndexedAccess`);
- **Node 24 LTS**, **pnpm**;
- Tailwind;
- TanStack Query for server state;
- ESLint, Vitest;
- Playwright (**Chromium only**: WebKit and screenshot baselines are deferred, DEC-055);
- openapi-typescript for API types; openapi-fetch as the runtime (provisional, DEC-092).

Per tech §5.1, subject to the approved feature specs:

- shadcn/ui (or the approved accessible kit);
- Zustand for transient canvas state;
- XYFlow/React Flow for editable and curated graphs;
- ELK.js **in a Web Worker** for hierarchical/orthogonal layout.

A WebGL renderer (Sigma.js) is only an option for read-only high-density views, after a benchmark.

## Target layout (§17.2)

```text
package.json  next.config.ts  specs.lock
public/azure-icons/          # pinned, versioned, licensed official Azure SVGs
src/app/                     # routes, shell, layouts
src/components/ui|canvas|shell/
src/features/studio|explore|intelligence/
src/generated/api/           # schema.d.ts generated from the pinned atlas-specs OpenAPI. NEVER hand-edit
src/lib/                     # auth, API transport (src/lib/api/transport.ts is the only module that knows the base URL), state, errors
src/styles/                  # tokens.generated.css from atlas-specs design/tokens.json. NEVER hand-edit
tests/  e2e/  deploy/  .github/workflows/
```

Routes (UX §3): `/`, `/landscape/:viewId`, `/applications/:id`, `/contracts[/:id]`, `/patterns[/:id]`, `/rules`, `/evaluations/:id`, `/sandbox/:id`, `/history/:viewId`, `/search`, `/admin`.

## Architecture rules

- **API access only through `src/generated/api`**, regenerated from the OpenAPI pinned in `specs.lock`. If the contract lacks something, change `atlas-specs` first. Don't hand-write a fetch to an undocumented endpoint, and never call Azure or a database directly.
- **Keep four kinds of state separate** (§5.4): `graphProjection` (read-only server response), `draftPatch` (typed edit commands), `viewState` (filters, viewport, expansion, selection), `uiState` (panels, menus). Never mutate projection data to animate collapse. Don't mirror server records in global stores.
- Renderer contract: `AtlasNode` / `AtlasEdge` / `AtlasProjection` (§5.4). Each node carries `canonicalId` and a trust `status`. Edges carry `relationshipIds[]` and `bundledCount`.
- **Never request or render the whole graph.** Ask for projections with scope/lens/environment/budget and expand groups on demand (`POST /views/{id}/expand`). Show `truncated` / hidden counts truthfully. Wheel zoom changes scale only. Semantic level (L0 Enterprise → L4 Detail) changes only on deliberate focus or expand (UX §4.3).
- Layout changes and graph-fact changes are different commands, and the UI says which one is being saved. Undo/redo covers draft commands only. Publish and approval are never undoable.
- Every save sends `If-Match`/revision and shows dirty → saving → saved/conflict/failed. **Never show "Saved" falsely.** On failure, keep the local draft and offer retry or export.
- Render imported content safely: no arbitrary HTML/JS/SVG from imported files, CSP-compatible.

## Interaction contract (UX §4.2, §5, §12)

- Explore is read-only by default. Edit requires an explicit, authorized draft context.
- Click selects and opens the inspector. Double-click opens X-Ray (in place, neighbours dimmed but **not removed**, anchor preserved). Clicking an edge opens the relationship inspector and its contract. Dragging empty canvas pans. Node drag works only in Edit.
- The viewport must not jump when the inspector opens. No forced recentre on selection. Back, breadcrumbs, filters, and selection survive navigation. Deep links reconstruct entity + view + lens + filters + focus.
- Keyboard: `/` or Cmd/Ctrl+K search/command palette, Esc clears, `F` fits, `+`/`-` zoom, arrow keys move through the accessible node list, Cmd/Ctrl+Z undoes in Edit. Every essential canvas task has a keyboard/list alternative.
- Context menus show only permitted actions. Forbidden ones are absent, or disabled with a reason. **No dead or "coming soon" controls.**
- Every view needs loading, empty, stale, permission-denied, error, partial/truncated, and conflict states (UX §4.4). An empty gray canvas is never acceptable.
- Restricted data is not revealed through labels, tooltips, counts, URLs, exports, or copy-link.
- No excluded-scope affordances anywhere (nav, copy, demo data, exports):
  - PR impact analysis or GitHub PR integration;
  - live telemetry or monitoring;
  - distributed tracing;
  - live health dashboards;
  - inferred runtime traffic.

  This is UX-GLB-012.

## Visual system (UX §2, tech §5.3)

Light theme by default (dark mode comes later, if ever). Proposed tokens: `--surface-app #FFFFFF`, `--surface-canvas #F8FAFE`, `--surface-subtle #F0F5FC`, `--ink-primary #15283F`, `--brand-primary #1769E0`. Entity colours: application `#5A54D6`, API `#1674E8`, compute `#8C58D8`, messaging `#C47B13`, data `#087F8C`, security `#BD4D76`, capability `#22865E`. All are **proposed** (DEC-065). Their source of truth is `atlas-specs` `design/tokens.json`, with contrast pairs checked there. Generate them into `src/styles` and never hard-code colours. Validate them for WCAG 2.2 AA.

- **Colour never encodes status alone.** Trust/stale/inferred/proposed also get a chip, icon, or pattern.
- Use official Azure SVG icons from the pinned registry. Unknown types get a labelled neutral fallback, never an emoji or misleading Azure branding.
- Containers are pale tints with 1–2px borders. Edges are neutral slate and orthogonal, with clear ports, and don't route through node bodies. Selection is a 2px+ blue highlight.
- Motion is 120–220ms and honours `prefers-reduced-motion`. The left rail is about 240px and collapsible. The inspector is about 320px, resizable, and overlays on small desktops.
- Reference viewports are 1440×900 and 1280×720. Tablets get read-only support.

## Testing expectations (§17.5, UX §11, §13)

TypeScript strict, ESLint, Vitest unit/component tests, generated-client reproducibility check, **Playwright E2E in real Chromium against a persisted backend (no mocked clicks or route interception in acceptance tests)**, axe accessibility checks plus manual checks. A second browser engine and golden screenshots at 1440×900 / 1280×720 are deferred (DEC-055). Validate a 100-node and a dense 1,000-node projection. Smoke journey: landscape → select app → X-Ray → Passport → save draft layout → reload.

Proposed performance targets: search p95 ≤1.5s, Passport ≤2.5s, curated landscape ≤3s (≤300 nodes / ≤500 bundles), X-Ray expand ≤2s. Rendering budgets are UX safety limits, not data limits.

## First slice (§19.1)

Sprint A: bright app shell + Azure icon registry. Sprint B: canvas select/pan/zoom, Passport inspector, search, deep links. Sprint C: X-Ray, edge bundles, layout save/reload, responsive inspector. Sprint D: draft editing, typed ports, ELK routing, undo/redo, browser E2E.
