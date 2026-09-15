import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlayerPropsPreview } from "@/components/card/player-props-preview";

export const metadata: Metadata = {
  title: "Player props · Disabled Preview",
  robots: { index: false, follow: false },
};

export default function PlayerPropsPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <PlayerPropsPreview />;
}
