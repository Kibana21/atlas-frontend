import type { SVGProps } from "react";

export type IconName = "success" | "warning" | "danger" | "info" | "pending" | "refresh";

const PATHS: Record<IconName, string> = {
  success:
    "M10 1.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5Zm3.53 6.28-4.25 4.5a.75.75 0 0 1-1.07.02l-2-1.9a.75.75 0 1 1 1.03-1.09l1.46 1.39 3.74-3.96a.75.75 0 1 1 1.09 1.04Z",
  warning:
    "M8.48 2.66a1.75 1.75 0 0 1 3.04 0l6.44 11.36A1.75 1.75 0 0 1 16.44 16.6H3.56a1.75 1.75 0 0 1-1.52-2.58L8.48 2.66ZM10 6.5a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 10 6.5Zm0 7.75a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z",
  danger:
    "M10 1.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5ZM7.53 6.47a.75.75 0 0 0-1.06 1.06L8.94 10l-2.47 2.47a.75.75 0 1 0 1.06 1.06L10 11.06l2.47 2.47a.75.75 0 1 0 1.06-1.06L11.06 10l2.47-2.47a.75.75 0 0 0-1.06-1.06L10 8.94 7.53 6.47Z",
  info: "M10 1.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5Zm0 4a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Zm.75 8.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 1.5 0v4.5Z",
  pending:
    "M10 1.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5Zm0 1.5a6.75 6.75 0 1 1 0 13.5 6.75 6.75 0 0 1 0-13.5Zm-3 6a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm3 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm3 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z",
  refresh:
    "M10 3.25a6.75 6.75 0 0 0-6.6 5.33.75.75 0 1 0 1.47.31A5.25 5.25 0 0 1 14.2 7.25H12.5a.75.75 0 0 0 0 1.5h3.75a.75.75 0 0 0 .75-.75V4.25a.75.75 0 0 0-1.5 0v1.6A6.73 6.73 0 0 0 10 3.25Zm6.6 7.92a.75.75 0 0 0-.88.58A5.25 5.25 0 0 1 5.8 12.75H7.5a.75.75 0 0 0 0-1.5H3.75a.75.75 0 0 0-.75.75v3.75a.75.75 0 0 0 1.5 0v-1.6a6.75 6.75 0 0 0 12.68-2.1.75.75 0 0 0-.58-.88Z",
};

/** Decorative icon (aria-hidden): meaning is always also given as text (AR-04). */
export function Icon({ name, className = "", ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={`atlas-icon shrink-0 ${className}`}
      {...rest}
    >
      <path fillRule="evenodd" clipRule="evenodd" d={PATHS[name]} />
    </svg>
  );
}
