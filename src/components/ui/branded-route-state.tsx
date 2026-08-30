"use client";

import Link from "next/link";
import { BrandLockup } from "@/components/ui/register-mark";
import { Button, buttonClassName } from "@/components/ui/button";

export function BrandedRouteState({
  actionLabel,
  backLabel = "Return home",
  backHref = "/",
  description,
  eyebrow,
  onAction,
  title,
}: {
  actionLabel?: string;
  backLabel?: string;
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
          aria-live={eyebrow === "Loading" ? "polite" : undefined}
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
            <Button className="mt-6 w-full" onClick={onAction} type="button">
              {actionLabel}
            </Button>
          ) : null}
          <Link
            className={buttonClassName({
              className: "mt-4 w-full",
              intent: "quiet",
            })}
            href={backHref}
          >
            {backLabel}
          </Link>
        </section>
      </div>
    </main>
  );
}
