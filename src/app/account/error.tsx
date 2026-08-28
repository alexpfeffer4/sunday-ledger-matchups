"use client";

import { BrandedRouteState } from "@/components/ui/branded-route-state";

export default function AccountError({ retry }: { retry: () => void }) {
  return (
    <BrandedRouteState
      actionLabel="Try again"
      description="Your account details could not load. Nothing was changed."
      eyebrow="Account unavailable"
      onAction={retry}
      title="We could not open your account"
    />
  );
}
