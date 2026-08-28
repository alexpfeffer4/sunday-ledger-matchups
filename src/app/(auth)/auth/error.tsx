"use client";

import { BrandedRouteState } from "@/components/ui/branded-route-state";

export default function AuthError({ retry }: { retry: () => void }) {
  return (
    <BrandedRouteState
      actionLabel="Try again"
      description="Account access could not load. Try again, or return home and request a fresh link."
      eyebrow="Account access unavailable"
      onAction={retry}
      title="We could not open this account screen"
    />
  );
}
