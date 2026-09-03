import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getOwnerRehearsal,
  hasOwnerRehearsalEntitlement,
} from "@/application/queries/get-owner-rehearsal";
import { OwnerRehearsalGuide } from "@/components/rehearsal/owner-rehearsal-guide";
import { BrandLockup } from "@/components/ui/register-mark";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const entitled = await hasOwnerRehearsalEntitlement();
  return {
    title: entitled ? "Owner rehearsal" : "Not found",
    robots: { follow: false, index: false },
  };
}

export default async function OwnerRehearsalPage() {
  const entitled = await hasOwnerRehearsalEntitlement();
  if (!entitled) notFound();
  const rehearsal = await getOwnerRehearsal();

  return (
    <main className="bg-canvas min-h-screen px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" aria-label="Sunday Ledger home">
            <BrandLockup variant="horizontal" />
          </Link>
          <div className="flex items-center gap-1">
            {rehearsal ? (
              <Link
                className="text-registry hover:bg-subtle inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold"
                href={`/l/${rehearsal.leagueSlug}/matchup`}
              >
                Enter rehearsal
              </Link>
            ) : null}
            <Link
              className="text-muted hover:bg-subtle hover:text-ink inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold"
              href="/account"
            >
              Account
            </Link>
          </div>
        </div>

        <header className="mt-12 sm:mt-16">
          <p className="text-registry text-xs font-bold tracking-[0.1em] uppercase">
            Private owner tools
          </p>
          <h1
            className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl"
            data-route-heading
            tabIndex={-1}
          >
            Owner Guided Rehearsal
          </h1>
          <p className="text-graphite mt-3 max-w-2xl leading-7">
            Learn the real member and commissioner rhythm in an accelerated,
            deterministic season. Simulated data never affects Live leagues.
          </p>
        </header>

        <div className="mt-8">
          <OwnerRehearsalGuide rehearsal={rehearsal} showReset />
        </div>

        <section className="border-boundary mt-8 grid gap-5 border-t pt-7 sm:grid-cols-3">
          <div>
            <h2 className="font-bold">Real product routes</h2>
            <p className="text-muted mt-2 text-sm leading-6">
              Matchup, Make picks, My Card, League, and More stay in their
              ordinary places.
            </p>
          </div>
          <div>
            <h2 className="font-bold">Accelerated waiting</h2>
            <p className="text-muted mt-2 text-sm leading-6">
              Invitations, Sunday waiting, and repetitive weeks are shortened;
              their authoritative actions are not skipped.
            </p>
          </div>
          <div>
            <h2 className="font-bold">Private by design</h2>
            <p className="text-muted mt-2 text-sm leading-6">
              Rehearsal teams have no sign-ins, and sealed opponent positions
              remain hidden until each game starts.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
