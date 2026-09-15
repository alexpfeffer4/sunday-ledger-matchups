/** Synthetic two-team final evidence: no member records or provider payload. */
export const nflversePrimaryContext = {
  externalEventId: "fixture-odds-game",
  sourceEventId: "2026_01_ATL_PIT",
  gameDate: "2026-09-13",
  scheduledStartAt: "2026-09-13T17:00:00.000Z",
  finalObservedAt: "2026-09-13T20:05:00.000Z",
  fetchedAt: "2026-09-14T12:00:00.000Z",
  sourceUpdatedAt: "2026-09-14T06:00:00.000Z",
  participationSourceUpdatedAt: "2026-09-14T07:00:00.000Z",
  final: true as const,
  awayTeam: "ATL",
  homeTeam: "PIT",
  mappings: [
    {
      subjectId: "a0000000-0000-4000-8000-000000000001",
      externalPlayerId: "00-0000001",
      pfrPlayerId: "PlayTe00",
      team: "Pittsburgh Steelers",
      sourceTeam: "PIT",
      statistic: "RECEIVING_YARDS" as const,
    },
  ],
};
export const nflversePrimaryFiles = {
  statsCsv: [
    "game_id,player_id,team,opponent_team,season,week,season_type,passing_yards,rushing_yards,receiving_yards",
    "2026_01_ATL_PIT,00-0000001,PIT,ATL,2026,1,REG,0,0,51",
    "2026_01_ATL_PIT,00-0000002,ATL,PIT,2026,1,REG,201,0,0",
  ].join("\n"),
  snapsCsv: [
    "game_id,pfr_game_id,pfr_player_id,team,opponent,season,week,game_type,offense_snaps",
    "2026_01_ATL_PIT,202609130pit,PlayTe00,PIT,ATL,2026,1,REG,54",
    "2026_01_ATL_PIT,202609130pit,QuarTe00,PIT,ATL,2026,1,REG,60",
    "2026_01_ATL_PIT,202609130pit,OppoTe00,ATL,PIT,2026,1,REG,62",
  ].join("\n"),
};
