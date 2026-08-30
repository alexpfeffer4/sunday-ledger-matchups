"use client";

import { BrandedRouteState } from "@/components/ui/branded-route-state";

export default function LeagueError({ retry }: { retry: () => void }) {
  return (
    <BrandedRouteState
      actionLabel="Try again"
      backHref="/leagues"
      backLabel="Return to Your leagues"
      description="This league page did not load. Accepted picks, receipts, and league records are unchanged."
      eyebrow="League unavailable"
      onAction={retry}
      title="We could not open this league page"
    />
  );
}
