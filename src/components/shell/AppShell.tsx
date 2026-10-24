import type { ReactNode } from "react";

import { EntitySpectrum } from "./EntitySpectrum";

/**
 * Shared application shell (ATLAS-001 FR-54): skip link, banner with the Atlas wordmark, main landmark.
 * Product navigation arrives with the product screens; until then the shell carries no links
 * (FR-55; no dead controls).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="atlas-canvas flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-10 rounded-md bg-surface-app px-4 py-2 text-sm font-semibold text-brand-primary shadow-elevation-2 focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Skip to main content
      </a>
      <header className="border-b border-line-subtle bg-surface-app/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-8">
          <span className="flex flex-col gap-1">
            <span className="text-lg font-semibold tracking-tight text-ink-primary">Atlas</span>
            <EntitySpectrum className="w-12" />
          </span>
          <span className="hidden text-sm text-ink-muted sm:inline">Enterprise architecture</span>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 outline-none sm:px-8"
      >
        {children}
      </main>
    </div>
  );
}
