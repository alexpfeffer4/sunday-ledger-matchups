import "server-only";

import { createSupabaseServerClient } from "@/adapters/supabase/server";

export type MyLeagueSummary = {
  archivedAt: string | null;
  canDelete: boolean;
  lifecycle: string;
  memberCount: number;
  name: string;
  role: string;
  slug: string;
};

export async function getMyLeagueSummary(
  leagueSlug: string,
): Promise<MyLeagueSummary | null> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .schema("api")
    .from("my_leagues")
    .select(
      "name, slug, role, lifecycle, archived_at, member_count, can_delete",
    )
    .eq("slug", leagueSlug)
    .maybeSingle();

  const name = result.data?.name;
  const slug = result.data?.slug;
  if (result.error || !result.data || !name || !slug) return null;
  const summary = result.data;

  return {
    archivedAt: summary.archived_at,
    canDelete: summary.can_delete ?? false,
    lifecycle: summary.lifecycle ?? "DRAFT",
    memberCount: summary.member_count ?? 0,
    name,
    role: summary.role ?? "MEMBER",
    slug,
  };
}
