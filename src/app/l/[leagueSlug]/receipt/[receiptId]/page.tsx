import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";
import { Stage1ReceiptView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Pick receipt" };

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; receiptId: string }>;
}) {
  const { leagueSlug, receiptId } = await params;
  const live = await getAuthoritativeLeagueState(leagueSlug);
  if (
    !live?.ownerCard?.positions.some((position) => position.id === receiptId)
  ) {
    notFound();
  }
  return <Stage1ReceiptView state={live} receiptId={receiptId} />;
}
