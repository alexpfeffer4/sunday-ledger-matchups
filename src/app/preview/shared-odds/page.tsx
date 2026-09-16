import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlayerPropsPreview } from "@/components/card/player-props-preview";
export const metadata: Metadata = {
  title: "Shared odds refresh · Fixture Preview",
  robots: { index: false, follow: false },
};
export default function SharedOddsPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <PlayerPropsPreview sharedRefresh />;
}
