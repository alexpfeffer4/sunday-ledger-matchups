import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Ui2Preview } from "@/components/league/ui2-preview";
export const metadata: Metadata = {
  title: "Member continuity · Fixture Preview",
  robots: { index: false, follow: false },
};
export default async function MemberPreviewPage({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const { screen } = await params;
  if (screen !== "slate" && screen !== "card" && screen !== "schedule")
    notFound();
  return <Ui2Preview key={screen} screen={screen} />;
}
