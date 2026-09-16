import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeasonAutomationPreview } from "@/components/commissioner/season-automation-preview";

export const metadata: Metadata = {
  title: "Season automation · Fixture Preview",
  robots: { index: false, follow: false },
};

export default function SeasonAutomationPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <SeasonAutomationPreview />;
}
