import { BrandedRouteState } from "@/components/ui/branded-route-state";

export default function NotFound() {
  return (
    <BrandedRouteState
      description="This page may have moved, or the address may be incomplete."
      eyebrow="Page not found"
      title="There is no Ledger page here"
    />
  );
}
