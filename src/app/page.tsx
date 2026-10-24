import { EntitySpectrum } from "@/components/shell/EntitySpectrum";
import { TextLink } from "@/components/ui/TextLink";

/**
 * Explicit placeholder (ATLAS-001 FR-55, replaced by Home in BL-105): the Atlas wordmark, one sentence and
 * exactly one interactive element, a link to /status. No icons, navigation or product features.
 */
export default function HomePage() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <div className="w-full max-w-2xl rounded-lg border border-line-subtle bg-surface-raised px-8 py-12 text-center shadow-elevation-3 sm:px-16">
        <EntitySpectrum className="mx-auto mb-8 w-16" />
        <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">Atlas</h1>
        <p className="mx-auto mt-4 max-w-md text-md leading-body text-ink-secondary">
          A bright, evidence-backed map of your enterprise architecture is being built here.
        </p>
        <div className="mt-8">
          <TextLink href="/status" variant="action">
            View system status
          </TextLink>
        </div>
      </div>
    </div>
  );
}
