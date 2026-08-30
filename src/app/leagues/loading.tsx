import { BrandedRouteState } from "@/components/ui/branded-route-state";

export default function LeaguesLoading() {
  return (
    <BrandedRouteState
      backHref="/"
      description="Preparing your active and archived league lists."
      eyebrow="Loading"
      title="Opening Your leagues…"
    />
  );
}
