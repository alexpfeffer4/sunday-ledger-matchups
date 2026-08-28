"use client";

import { BrandedRouteState } from "@/components/ui/branded-route-state";

export default function InvitationError({ retry }: { retry: () => void }) {
  return (
    <BrandedRouteState
      actionLabel="Check again"
      description="We could not check this private invitation. No account or league membership was changed."
      eyebrow="Invitation unavailable"
      onAction={retry}
      title="This invitation could not load"
    />
  );
}
