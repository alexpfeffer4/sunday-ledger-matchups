import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Ui1Preview } from "@/components/commissioner/ui1-preview";
export const metadata: Metadata = {
  title: "Commissioner clarity · Fixture Preview",
  robots: { index: false, follow: false },
};
export default function CommissionerPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <Ui1Preview />;
}
