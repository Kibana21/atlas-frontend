import type { ReactNode } from "react";

/** Raised surface for grouped content; labelled by its heading when one is given. */
export function Panel({
  title,
  headingId,
  children,
  className = "",
  busy = false,
}: {
  title?: string;
  headingId?: string;
  children: ReactNode;
  className?: string;
  busy?: boolean;
}) {
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      aria-busy={busy || undefined}
      className={`rounded-lg border border-line-subtle bg-surface-raised p-6 shadow-elevation-1 ${className}`}
    >
      {title ? (
        <h2 id={headingId} className="mb-4 text-md font-semibold text-ink-primary">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
