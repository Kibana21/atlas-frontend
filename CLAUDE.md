# atlas-frontend

Next.js web app for Atlas: the bright shell, the architecture canvas, and the Studio / Explore / Intelligence experiences. It owns presentation, canvas interaction, and client state. The backend owns identity, authorization, graph rules, reconciliation, validation, and persistence. **Never duplicate authoritative graph business rules in TypeScript.** Form validation is for UX only, and the backend revalidates every write.

Independent Git repo (`origin` = github.com/Kibana21/atlas-frontend). Workspace overview and product invariants: `../CLAUDE.md`. Specs: `../atlas-specs/ux/Atlas_Bright_UX_Interaction_Requirements_v1_1.md` (UX-* IDs, normative for behaviour) and `../atlas-specs/technical/...v1_1.md` §5, §17.2.

## Status

Empty scaffold: only `README.md` and `.gitignore` (Node/Next). No `package.json`, code, or CI yet. Add a **Commands** section here once tooling exists. Don't document commands that aren't real. The package manager is undecided (pnpm is suggested in §17.2), so confirm with the user.

## Stack (proposed, §5.1)

Next.js App Router · React · TypeScript **strict** · Tailwind · shadcn/ui (or the approved accessible kit) · TanStack Query for server state · Zustand for transient canvas state · XYFlow/React Flow for editable and curated graphs · ELK.js **in a Web Worker** for hierarchical/orthogonal layout · Vitest · Playwright · visual regression. A WebGL renderer (Sigma.js) is only an option for read-only high-density views, after a benchmark.

## Target layout (§17.2)

```
package.json  next.config.ts  specs.lock
public/azure-icons/          # pinned, versioned, licensed official Azure SVGs
src/app/                     # routes, shell, layouts
src/components/ui|canvas|shell/
src/features/studio|explore|intelligence/
src/generated/api/           # typed client generated from pinned atlas-specs OpenAPI. NEVER hand-edit
src/lib/                     # auth, API transport, state, errors
src/styles/                  # design tokens
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
- No PR or telemetry affordances anywhere: nav, copy, demo data, or exports (UX-GLB-012).

## Visual system (UX §2, tech §5.3)

Light theme by default (dark mode comes later, if ever). Proposed tokens: `--surface-app #FFFFFF`, `--surface-canvas #F8FAFE`, `--surface-subtle #F0F5FC`, `--ink-primary #15283F`, `--brand-primary #1769E0`. Entity colours: application `#5A54D6`, API `#1674E8`, compute `#8C58D8`, messaging `#C47B13`, data `#087F8C`, security `#BD4D76`, capability `#22865E`. All are candidates, so define them once in `src/styles` and validate them for WCAG 2.2 AA.
- **Colour never encodes status alone.** Trust/stale/inferred/proposed also get a chip, icon, or pattern.
- Use official Azure SVG icons from the pinned registry. Unknown types get a labelled neutral fallback, never an emoji or misleading Azure branding.
- Containers are pale tints with 1–2px borders. Edges are neutral slate and orthogonal, with clear ports, and don't route through node bodies. Selection is a 2px+ blue highlight.
- Motion is 120–220ms and honours `prefers-reduced-motion`. The left rail is about 240px and collapsible. The inspector is about 320px, resizable, and overlays on small desktops.
- Reference viewports are 1440×900 and 1280×720. Tablets get read-only support.

## Testing expectations (§17.5, UX §11, §13)

TypeScript strict, ESLint, Vitest unit/component tests, generated-client reproducibility check, **Playwright E2E in real Chromium + one other browser against a persisted backend (no mocked clicks in acceptance tests)**, golden screenshots at 1440×900 and 1280×720, and automated plus manual accessibility checks. Validate a 100-node and a dense 1,000-node projection. Smoke journey: landscape → select app → X-Ray → Passport → save draft layout → reload.

Proposed performance targets: search p95 ≤1.5s, Passport ≤2.5s, curated landscape ≤3s (≤300 nodes / ≤500 bundles), X-Ray expand ≤2s. Rendering budgets are UX safety limits, not data limits.

## First slice (§19.1)

Sprint A: bright app shell + Azure icon registry. Sprint B: canvas select/pan/zoom, Passport inspector, search, deep links. Sprint C: X-Ray, edge bundles, layout save/reload, responsive inspector. Sprint D: draft editing, typed ports, ELK routing, undo/redo, browser E2E.
