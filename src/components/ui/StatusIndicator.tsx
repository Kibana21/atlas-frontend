import { Icon, type IconName } from "./icons";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE: Record<Tone, { icon: IconName; text: string; tint: string; ring: string }> = {
  success: {
    icon: "success",
    text: "text-status-success-fg",
    tint: "bg-status-success-tint",
    ring: "ring-status-success-fg/25",
  },
  warning: {
    icon: "warning",
    text: "text-status-warning-fg",
    tint: "bg-status-warning-tint",
    ring: "ring-status-warning-fg/25",
  },
  danger: {
    icon: "danger",
    text: "text-status-danger-fg",
    tint: "bg-status-danger-tint",
    ring: "ring-status-danger-fg/25",
  },
  info: {
    icon: "info",
    text: "text-status-info-fg",
    tint: "bg-status-info-tint",
    ring: "ring-status-info-fg/25",
  },
  neutral: {
    icon: "pending",
    text: "text-ink-secondary",
    tint: "bg-surface-subtle",
    ring: "ring-line-strong/30",
  },
};

/** Status as icon AND text, never colour alone (AR-04). Status colours are text-safe on their tints. */
export function StatusIndicator({
  tone,
  label,
  size = "md",
}: {
  tone: Tone;
  label: string;
  size?: "md" | "lg";
}) {
  const t = TONE[tone];
  const large = size === "lg";
  return (
    <span
      data-tone={tone}
      className={`inline-flex w-fit items-center gap-2 rounded-full ring-1 ring-inset ${t.tint} ${t.text} ${t.ring} ${
        large ? "px-4 py-2 text-md font-semibold" : "px-3 py-1 text-sm font-medium"
      }`}
    >
      <Icon name={t.icon} className={large ? "size-icon-md" : "size-icon-sm"} />
      <span>{label}</span>
    </span>
  );
}
