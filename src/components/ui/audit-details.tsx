import type { ReactNode } from "react";

export function AuditDetails({
  children,
  className = "",
  context,
}: {
  children: ReactNode;
  className?: string;
  context: string;
}) {
  return (
    <details className={`border-boundary border-y py-3 text-sm ${className}`}>
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold">
        Audit details
      </summary>
      <p className="text-graphite mt-2 leading-6">{context}</p>
      <div className="mt-4">{children}</div>
    </details>
  );
}
