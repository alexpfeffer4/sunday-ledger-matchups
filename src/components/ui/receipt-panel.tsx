import type { ReactNode } from "react";
import { RegisterMark } from "@/components/ui/register-mark";

export function ReceiptPanel({
  audit,
  children,
  status,
  summary,
  title = "Accepted pick",
}: {
  audit: ReactNode;
  children: ReactNode;
  status?: ReactNode;
  summary: string;
  title?: string;
}) {
  return (
    <section
      aria-label="Accepted receipt"
      className="border-boundary bg-surface mt-6 rounded-lg border p-5 sm:p-6"
    >
      <div className="border-boundary flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <div className="text-muted mb-3 inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.06em] uppercase">
            <span className="text-registry" aria-hidden="true">
              <RegisterMark master="micro" />
            </span>
            <span>Sunday Ledger receipt</span>
          </div>
          <p className="text-registry text-xs font-bold tracking-[0.07em] uppercase">
            Receipt summary
          </p>
          <h2 className="mt-1 text-lg font-bold">{title}</h2>
          <p className="text-graphite mt-2 max-w-2xl text-sm leading-6">
            {summary}
          </p>
        </div>
        {status}
      </div>
      <div className="mt-5">{children}</div>
      <div className="mt-6">{audit}</div>
    </section>
  );
}
