import type { ReactNode } from "react";

/** Content for assistive technology only (still in the accessibility tree). */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
