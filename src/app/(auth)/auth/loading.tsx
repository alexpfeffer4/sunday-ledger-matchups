import { BrandedRouteState } from "@/components/ui/branded-route-state";

export default function AuthLoading() {
  return (
    <BrandedRouteState
      description="Preparing secure account access."
      eyebrow="Loading"
      title="Opening account access…"
    />
  );
}
