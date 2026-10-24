"use client";

import { useQueries } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { StatusIndicator, type Tone } from "@/components/ui/StatusIndicator";
import { TextLink } from "@/components/ui/TextLink";
import { createTransport, type BuildInfo, type Transport } from "@/lib/api/transport";
import { deriveStatus, type CheckState, type StatusModel, type StatusState } from "@/lib/status/derive";

const SUMMARY: Record<StatusState, { tone: Tone; label: string; detail: (m: StatusModel) => string }> = {
  loading: { tone: "info", label: "Checking", detail: () => "Contacting the Atlas API…" },
  ready: { tone: "success", label: "Ready", detail: () => "The API, the database and Redis all responded." },
  degraded: {
    tone: "warning",
    label: "Degraded",
    detail: (m) =>
      `The API is running, but ${m.checks.redis === "failed" ? "Redis" : "the database"} did not respond in time.`,
  },
  unreachable: {
    tone: "danger",
    label: "API unreachable",
    detail: () =>
      "The Atlas API could not be reached. Check that the backend is running and the URL is right.",
  },
  "diagnostics-disabled": {
    tone: "info",
    label: "Ready, diagnostics disabled",
    detail: () => "All dependencies responded. Build diagnostics are disabled in this environment.",
  },
  error: {
    tone: "danger",
    label: "Unexpected error",
    detail: (m) => `The API returned an unexpected response (${m.errorCode ?? "unknown"}).`,
  },
};

const ACCENT: Record<Tone, string> = {
  success: "border-l-status-success-fg",
  warning: "border-l-status-warning-fg",
  danger: "border-l-status-danger-fg",
  info: "border-l-status-info-fg",
  neutral: "border-l-line-strong",
};

const CHECK: Record<CheckState, { tone: Tone; label: string }> = {
  ok: { tone: "success", label: "Operational" },
  failed: { tone: "danger", label: "Not responding" },
  unknown: { tone: "neutral", label: "Not checked" },
};

function CheckCard({ name, description, state }: { name: string; description: string; state: CheckState }) {
  const c = CHECK[state];
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface-raised p-6 shadow-elevation-1">
      <div>
        <h3 className="text-md font-semibold text-ink-primary">{name}</h3>
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
      </div>
      <StatusIndicator tone={c.tone} label={c.label} />
    </li>
  );
}

function Sha({ value }: { value: string | undefined }) {
  if (!value) return <span className="text-ink-muted">Unavailable</span>;
  return <code className="text-sm break-all text-ink-primary">{value}</code>;
}

function Provenance({ model, frontendSha }: { model: StatusModel; frontendSha: string }) {
  const build: BuildInfo | null = model.build;
  if (model.state === "diagnostics-disabled") {
    return <p className="text-sm text-ink-secondary">Build diagnostics are disabled in this environment.</p>;
  }
  const rows: Array<[string, ReactNode]> = [
    ["Environment", build?.environment ?? <span className="text-ink-muted">Unavailable</span>],
    ["Contract version", build?.contract_version ?? <span className="text-ink-muted">Unavailable</span>],
    [
      "Database migration",
      build ? (
        (build.db_migration_revision ?? <span className="text-ink-muted">None</span>)
      ) : (
        <span className="text-ink-muted">Unavailable</span>
      ),
    ],
    ["Backend commit", <Sha key="b" value={build?.backend_sha} />],
    ["Specs commit", <Sha key="s" value={build?.specs_sha} />],
    ["Frontend commit", <Sha key="f" value={frontendSha} />],
  ];
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[max-content_1fr]">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-sm font-medium text-ink-secondary">{term}</dt>
          <dd className="m-0 text-sm text-ink-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** /status (ATLAS-001 FR-56): true state of the API and its dependencies, announced politely. */
export function StatusView({ transport, frontendSha }: { transport?: Transport; frontendSha: string }) {
  const [api] = useState<Transport>(() => transport ?? createTransport());
  const results = useQueries({
    queries: [
      { queryKey: ["health", "live"], queryFn: () => api.getHealthLive() },
      { queryKey: ["health", "ready"], queryFn: () => api.getHealthReady() },
      { queryKey: ["diagnostics", "build"], queryFn: () => api.getDiagnosticsBuild() },
    ],
  });
  const [live, ready, build] = results;
  const model = deriveStatus(
    { data: live?.data?.data, error: live?.error ?? undefined, pending: live?.isPending ?? true },
    { data: ready?.data?.data, error: ready?.error ?? undefined, pending: ready?.isPending ?? true },
    { data: build?.data?.data, error: build?.error ?? undefined, pending: build?.isPending ?? true },
  );
  const fetching = results.some((r) => r.isFetching);
  const summary = SUMMARY[model.state];
  const updatedAt = Math.max(...results.map((r) => Math.max(r.dataUpdatedAt, r.errorUpdatedAt)));
  const lastChecked = updatedAt > 0 ? new Date(updatedAt).toLocaleTimeString("en-GB") : null;

  async function retry() {
    if (fetching) return; // a check is already running
    await Promise.all(results.map((r) => r.refetch()));
  }

  return (
    <div className="flex min-w-[480px] flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">System status</h1>
        <p className="mt-2 max-w-2xl text-md leading-body text-ink-secondary">
          Current readings from the Atlas API, refreshed when you ask.
        </p>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {model.state === "loading"
          ? "Checking Atlas services."
          : `Status: ${summary.label}. ${summary.detail(model)}`}
      </p>

      <Panel
        busy={model.state === "loading" || fetching}
        className={`flex flex-col gap-4 border-l-4 sm:flex-row sm:items-center sm:justify-between ${ACCENT[summary.tone]}`}
      >
        <div className={`flex flex-col gap-3 ${model.state === "loading" ? "atlas-pulse" : ""}`}>
          <StatusIndicator tone={summary.tone} label={summary.label} size="lg" />
          <p className="text-sm text-ink-secondary">{summary.detail(model)}</p>
          {model.correlationId ? (
            <p className="text-sm text-ink-muted">
              Correlation ID <code className="text-ink-primary">{model.correlationId}</code>
            </p>
          ) : null}
          {lastChecked ? <p className="text-xs text-ink-muted">Last checked {lastChecked}</p> : null}
        </div>
        {/* aria-disabled, not disabled: a disabled button drops keyboard focus to the page while checks run. */}
        <Button onClick={() => void retry()} aria-disabled={fetching} aria-describedby="retry-hint">
          <Icon name="refresh" className="size-icon-sm" />
          {fetching ? "Checking…" : "Check again"}
        </Button>
        <span id="retry-hint" className="sr-only">
          Runs all status checks again.
        </span>
      </Panel>

      <section aria-labelledby="checks-heading">
        <h2 id="checks-heading" className="mb-4 text-lg font-semibold text-ink-primary">
          Checks
        </h2>
        <ul className="grid list-none gap-4 p-0 sm:grid-cols-3">
          <CheckCard name="API" description="The Atlas API process is live." state={model.checks.api} />
          <CheckCard
            name="Database"
            description="PostgreSQL answers as the runtime role."
            state={model.checks.database}
          />
          <CheckCard
            name="Redis"
            description="The Atlas Redis database answers."
            state={model.checks.redis}
          />
        </ul>
      </section>

      <Panel title="Build provenance" headingId="provenance-heading">
        <Provenance model={model} frontendSha={frontendSha} />
      </Panel>

      {/* Solid canvas backing: no dot of the canvas grid may sit behind link text (contrast, AR-01). */}
      <p className="w-fit bg-surface-canvas">
        <TextLink href="/">Back to home</TextLink>
      </p>
    </div>
  );
}
