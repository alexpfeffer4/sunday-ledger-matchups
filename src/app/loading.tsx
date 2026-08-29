import { BrandedRouteState } from "@/components/ui/branded-route-state";

export default function RootLoading() {
  return (
    <BrandedRouteState
      description="Preparing the latest Sunday Ledger page."
      eyebrow="Loading"
      title="Opening the Ledger…"
    />
  );
}
