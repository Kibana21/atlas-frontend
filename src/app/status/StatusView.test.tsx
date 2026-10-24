import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AtlasApiError } from "@/lib/api/errors";
import type { BuildInfo, Transport } from "@/lib/api/transport";
import { createQueryClient } from "@/lib/query/client";

import { axeViolations } from "../../../tests/axe";

import { StatusView } from "./StatusView";

const SHA = "f".repeat(40);
const BUILD: BuildInfo = {
  backend_sha: "a".repeat(40),
  specs_sha: "b".repeat(40),
  contract_version: "0.1.0",
  db_migration_revision: "0001_baseline",
  environment: "local",
};
const ok = <T,>(data: T) => Promise.resolve({ data, status: 200, correlationId: "req_ok000001" });
const err = (code: string, status: number | null, details: Record<string, unknown> = {}) =>
  Promise.reject(
    new AtlasApiError({ code, message: "m", status, correlationId: `cid_${code.toLowerCase()}`, details }),
  );

function transport(
  overrides: Partial<Record<keyof Transport, () => Promise<never>>> = {},
): Transport & { calls: number } {
  const t = {
    calls: 0,
    getHealthLive: () => (t.calls++, overrides.getHealthLive?.() ?? ok({ status: "ok" as const })),
    getHealthReady: () =>
      overrides.getHealthReady?.() ??
      ok({ status: "ok" as const, checks: { database: "ok" as const, redis: "ok" as const } }),
    getDiagnosticsBuild: () => overrides.getDiagnosticsBuild?.() ?? ok(BUILD),
  };
  return t as Transport & { calls: number };
}

function renderStatus(t: Transport) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <StatusView transport={t} frontendSha={SHA} />
    </QueryClientProvider>,
  );
}

const live = () => screen.getByRole("status");

describe("/status (FR-56)", () => {
  it("loading: announces the check and marks the panel busy", async () => {
    const pending = () => new Promise<never>(() => undefined);
    const { container } = renderStatus(
      transport({ getHealthLive: pending, getHealthReady: pending, getDiagnosticsBuild: pending }),
    );
    expect(live()).toHaveAttribute("aria-live", "polite");
    expect(live()).toHaveTextContent("Checking Atlas services.");
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.getAllByText("Not checked")).toHaveLength(3);
  });

  it("ready: all checks operational and full build provenance", async () => {
    const { container } = renderStatus(transport());
    await waitFor(() => expect(live()).toHaveTextContent("Status: Ready."));
    expect(screen.getAllByText("Operational")).toHaveLength(3);
    const provenance = screen.getByRole("region", { name: "Build provenance" });
    for (const value of [BUILD.backend_sha, BUILD.specs_sha, SHA, "0.1.0", "0001_baseline", "local"]) {
      expect(within(provenance).getByText(value)).toBeInTheDocument();
    }
    expect(await axeViolations(container)).toEqual([]);
  });

  it("degraded: names the dependency that failed and shows the correlation ID", async () => {
    const { container } = renderStatus(
      transport({ getHealthReady: () => err("DEPENDENCY_UNAVAILABLE", 503, { failed_check: "redis" }) }),
    );
    await waitFor(() => expect(live()).toHaveTextContent("Status: Degraded."));
    expect(live()).toHaveTextContent("Redis did not respond in time");
    expect(screen.getByText("Not responding")).toBeInTheDocument();
    expect(screen.getByText("cid_dependency_unavailable")).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("unreachable: nothing is claimed healthy", async () => {
    const down = () => err("NETWORK_UNAVAILABLE", null);
    const { container } = renderStatus(
      transport({ getHealthLive: down, getHealthReady: down, getDiagnosticsBuild: down }),
    );
    await waitFor(() => expect(live()).toHaveTextContent("Status: API unreachable."));
    expect(screen.queryByText("Operational")).toBeNull();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(5);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("diagnostics disabled: readiness shown, provenance withheld", async () => {
    renderStatus(transport({ getDiagnosticsBuild: () => err("NOT_FOUND", 404) }));
    await waitFor(() => expect(live()).toHaveTextContent("Status: Ready, diagnostics disabled."));
    expect(screen.getByText("Build diagnostics are disabled in this environment.")).toBeInTheDocument();
    expect(screen.getAllByText("Operational")).toHaveLength(3);
  });

  it("error: shows the code and correlation ID", async () => {
    const { container } = renderStatus(transport({ getHealthLive: () => err("INTERNAL_ERROR", 500) }));
    await waitFor(() => expect(live()).toHaveTextContent("Status: Unexpected error."));
    expect(live()).toHaveTextContent("INTERNAL_ERROR");
    expect(screen.getByText("cid_internal_error")).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("status is conveyed by icon and text, never colour alone", async () => {
    const { container } = renderStatus(transport());
    await waitFor(() => expect(live()).toHaveTextContent("Status: Ready."));
    for (const pill of container.querySelectorAll("[data-tone]")) {
      expect(pill.querySelector("svg[aria-hidden='true']")).not.toBeNull();
      expect(pill.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("'Check again' refetches every check and is keyboard operable", async () => {
    const t = transport();
    renderStatus(t);
    await waitFor(() => expect(live()).toHaveTextContent("Status: Ready."));
    expect(t.calls).toBe(1);
    const button = screen.getByRole("button", { name: /check again/i });
    button.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(t.calls).toBe(2));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("System status");
  });
});
