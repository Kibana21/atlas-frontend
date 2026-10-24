import Link from "next/link";
import type { ReactNode } from "react";

/** Internal navigation link. "action" looks like a primary button but stays a native link. */
export function TextLink({
  href,
  children,
  variant = "inline",
}: {
  href: string;
  children: ReactNode;
  variant?: "inline" | "action";
}) {
  const look =
    variant === "action"
      ? "inline-flex h-control-lg items-center gap-2 rounded-md bg-brand-primary px-6 text-md font-semibold text-brand-on-primary shadow-elevation-2 hover:bg-brand-primary-hover"
      : "font-medium text-brand-primary underline decoration-1 underline-offset-4 hover:text-brand-primary-hover";
  return (
    <Link href={href} className={`atlas-transition ${look}`}>
      {children}
    </Link>
  );
}
