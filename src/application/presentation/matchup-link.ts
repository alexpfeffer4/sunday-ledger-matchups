export function matchupHref(
  leagueSlug: string,
  week: number,
  matchupId?: string,
) {
  const query = new URLSearchParams({ week: String(week) });
  if (matchupId) query.set("matchup", matchupId);
  return `/l/${leagueSlug}/matchup?${query}`;
}
