import { BrandedRouteState } from "@/components/ui/branded-route-state";

export default function InvitationLoading() {
  return (
    <BrandedRouteState
      description="Checking this private invitation and its league details."
      eyebrow="Loading"
      title="Opening invitation…"
    />
  );
}
