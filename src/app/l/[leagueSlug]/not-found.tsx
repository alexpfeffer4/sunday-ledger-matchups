import { BrandedRouteState } from "@/components/ui/branded-route-state";

export default function LeagueNotFound() {
  return (
    <BrandedRouteState
      backHref="/leagues"
      backLabel="Return to Your leagues"
      description="The address may be incomplete, or this account may not have access to that private league."
      eyebrow="League not found"
      title="This league is not available"
    />
  );
}
