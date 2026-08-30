import type { ReactNode } from "react";

type AlertTone = "info" | "success" | "warning" | "error" | "neutral";

const tones: Record<AlertTone, string> = {
  info: "border-registry/30 bg-registry/10 text-registry",
  success: "border-positive/30 bg-positive/10 text-positive",
  warning: "border-pending/30 bg-pending/10 text-pending",
  error: "border-negative/30 bg-negative/10 text-negative",
  neutral: "border-boundary bg-subtle text-graphite",
};

export function Alert({
  announce = false,
  children,
  className = "",
  title,
  tone = "neutral",
}: {
  announce?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
  tone?: AlertTone;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm leading-6 ${tones[tone]} ${className}`}
      role={tone === "error" ? "alert" : announce ? "status" : undefined}
    >
      {title ? <p className="font-bold">{title}</p> : null}
      <div className={title ? "mt-1" : ""}>{children}</div>
    </div>
  );
}
