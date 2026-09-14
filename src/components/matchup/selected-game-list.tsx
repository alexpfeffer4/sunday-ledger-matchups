import type { SelectedGame } from "@/application/queries/rolling-matchup";

export function SelectedGameList({
  games,
  memberName,
}: {
  games: readonly SelectedGame[];
  memberName: string;
}) {
  if (games.length === 0) return null;
  return (
    <section aria-label={`${memberName} selected games`} className="min-w-0">
      <h3 className="text-sm font-bold break-words">{memberName}</h3>
      <ul className="mt-2 space-y-2">
        {games.map((game) => (
          <li
            key={game.eventId}
            className="border-boundary bg-subtle rounded-lg border p-3"
          >
            <p className="text-sm font-semibold break-words">
              {game.eventLabel}
            </p>
            <p className="text-muted mt-1 text-xs leading-5">
              <time dateTime={game.scheduledStartAt}>
                {new Date(game.scheduledStartAt).toLocaleString("en-US", {
                  timeZone: "America/New_York",
                  weekday: "short",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </time>
              {" · "}Bets hidden until confirmed kickoff
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
