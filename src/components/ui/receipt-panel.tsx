import type { ReactNode } from "react";

export function ReceiptPanel({
  audit,
  children,
}: {
  audit: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Accepted receipt"
      className="border-boundary bg-surface mt-7 rounded-xl border p-6"
    >
      {children}
      <div className="mt-6">{audit}</div>
    </section>
  );
}
