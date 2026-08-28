import { BrandedRouteState } from "@/components/ui/branded-route-state";

export default function AccountLoading() {
  return (
    <BrandedRouteState
      description="Confirming your account and preparing the required fields."
      eyebrow="Loading"
      title="Preparing your account…"
    />
  );
}
