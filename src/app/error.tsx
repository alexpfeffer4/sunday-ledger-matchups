"use client";

import { BrandedRouteState } from "@/components/ui/branded-route-state";

export default function RootError({ retry }: { retry: () => void }) {
  return (
    <BrandedRouteState
      actionLabel="Try again"
      description="This page did not load, and no league action was completed."
      eyebrow="Page unavailable"
      onAction={retry}
      title="We could not open this page"
    />
  );
}
