import { BrandedRouteState } from "@/components/ui/branded-route-state";

export default function LeagueLoading() {
  return (
    <BrandedRouteState
      backHref="/leagues"
      backLabel="Return to Your leagues"
      description="Preparing this league’s latest accepted records and member view."
      eyebrow="Loading"
      title="Opening league…"
    />
  );
}
