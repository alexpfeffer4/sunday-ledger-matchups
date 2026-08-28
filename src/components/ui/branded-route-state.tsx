"use client";

import Link from "next/link";
import { BrandLockup } from "@/components/ui/register-mark";

export function BrandedRouteState({
  actionLabel,
  backHref = "/",
  description,
  eyebrow,
  onAction,
  title,
}: {
  actionLabel?: string;
  backHref?: string;
  description: string;
  eyebrow: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-md">
        <Link href="/" aria-label="Sunday Ledger home">
          <BrandLockup />
        </Link>
        <section
          aria-busy={eyebrow === "Loading"}
          className="border-boundary bg-surface mt-16 rounded-xl border p-6 shadow-[var(--shadow-card)] sm:p-8"
        >
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
            {title}
          </h1>
          <p className="text-graphite mt-3 leading-7">{description}</p>
          {onAction && actionLabel ? (
            <button
              className="bg-registry hover:bg-registry-hover mt-6 min-h-12 w-full rounded-lg px-5 text-sm font-semibold text-white"
              onClick={onAction}
              type="button"
            >
              {actionLabel}
            </button>
          ) : null}
          <Link
            className="text-action mt-5 inline-flex min-h-11 items-center font-semibold hover:underline"
            href={backHref}
          >
            Return home
          </Link>
        </section>
      </div>
    </main>
  );
}
