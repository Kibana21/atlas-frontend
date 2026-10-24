import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Native button with Atlas styling; targets are >= 24 px (AR-07) and the shared focus ring applies. */
export function Button({
  variant = "secondary",
  children,
  className = "",
  type = "button",
  ...rest
}: { variant?: "primary" | "secondary"; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const look =
    variant === "primary"
      ? "bg-brand-primary text-brand-on-primary hover:bg-brand-primary-hover shadow-elevation-1"
      : "bg-surface-app text-ink-primary border border-line-strong hover:bg-surface-subtle";
  return (
    <button
      type={type}
      className={`atlas-transition inline-flex h-control-lg min-w-control-sm items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${look} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
