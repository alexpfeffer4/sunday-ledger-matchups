import type { ReactNode } from "react";

type StatusTone =
  "positive" | "negative" | "pending" | "void" | "live" | "sealed";

const tones: Record<StatusTone, string> = {
  positive: "border-positive/25 bg-positive/10 text-positive",
  negative: "border-negative/25 bg-negative/10 text-negative",
  pending: "border-pending/25 bg-pending/10 text-pending",
  void: "border-void/25 bg-void/10 text-void",
  live: "border-live/25 bg-live/10 text-live",
  sealed: "border-sealed/25 bg-sealed/10 text-sealed",
};

export function StatusBadge({
  children,
  tone,
  icon,
}: {
  children: ReactNode;
  tone: StatusTone;
  icon?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}
