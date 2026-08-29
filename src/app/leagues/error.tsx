"use client";

import { BrandedRouteState } from "@/components/ui/branded-route-state";

export default function LeaguesError({ retry }: { retry: () => void }) {
  return (
    <BrandedRouteState
      actionLabel="Try again"
      description="Your league list did not load. No membership, archive, or league record was changed."
      eyebrow="Leagues unavailable"
      onAction={retry}
      title="We could not open Your leagues"
    />
  );
}
