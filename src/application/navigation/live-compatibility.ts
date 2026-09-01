export type LiveCompatibilitySearch = Record<
  string,
  string | string[] | undefined
>;

export function liveCompatibilityHref(
  leagueSlug: string,
  searchParams: LiveCompatibilitySearch,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value !== undefined) {
      query.append(key, value);
    }
  }
  const serialized = query.toString();
  return `/l/${encodeURIComponent(leagueSlug)}/matchup${serialized ? `?${serialized}` : ""}`;
}
