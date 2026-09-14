import type {
  PairedMatchupDto,
  PositionLedgerItem,
} from "@/application/queries/project-paired-matchup";
import {
  lineupMarkets,
  matchupGames,
} from "@/application/presentation/matchup-lineup";
import { easternTime } from "@/application/queries/score-freshness";
import {
  formatAmericanOdds,
  formatMarketProposition,
} from "@/components/card/market-option-copy";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCenticredits, formatCredits } from "@/domain/odds/american";
import { CompletedGame } from "./completed-game";

function Bet({ row }: { row: PositionLedgerItem }) {
  const state = row.corrected
    ? "Corrected"
    : row.outcome === "WIN"
      ? "Won"
      : row.outcome === "LOSS"
        ? "Lost"
        : row.outcome === "PUSH"
          ? "Push"
          : row.outcome === "VOID"
            ? "Void"
            : row.section === "IN_PROGRESS"
              ? "In progress"
              : "Remaining";
  const tone = row.corrected
    ? "corrected"
    : row.outcome === "WIN"
      ? "positive"
      : row.outcome === "LOSS"
        ? "negative"
        : row.outcome
          ? "void"
          : row.section === "IN_PROGRESS"
            ? "live"
            : "sealed";
  const proposition = formatMarketProposition(row.proposition);
  const returned =
    row.returnedCenticredits === null
      ? "Pending"
      : formatCenticredits(BigInt(row.returnedCenticredits), true);
  return (
    <li
      className="lineup-bet"
      data-position-id={row.id}
      data-side={row.side}
      aria-label={`${row.memberName}, ${row.eventLabel}, ${proposition}, ${formatAmericanOdds(row.americanOdds)}, ${formatCredits(row.stakeCredits)} credits staked, ${state}, ${returned} credits returned`}
    >
      <p className="lineup-pick font-semibold">{proposition}</p>
      <p className="text-muted mt-1 text-xs">
        <span className="font-mono whitespace-nowrap">
          {formatAmericanOdds(row.americanOdds)}
        </span>{" "}
        · {row.marketType.toLowerCase()}
      </p>
      <dl className="lineup-bet-facts mt-3 text-xs">
        <div>
          <dt className="text-muted">Stake</dt>
          <dd className="mt-1 font-mono font-semibold">
            {formatCredits(row.stakeCredits)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Returned</dt>
          <dd className="mt-1 font-mono font-semibold">{returned}</dd>
        </div>
      </dl>
      <div className="mt-3">
        <StatusBadge tone={tone}>{state}</StatusBadge>
        {row.corrected && row.outcome ? (
          <span className="mt-1 block text-xs">
            {row.outcome.toLowerCase()}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function MatchupLineup({ matchup }: { matchup: PairedMatchupDto }) {
  const games = matchupGames(matchup);
  if (!games.length && matchup.phase === "PREGAME") return null;
  return (
    <section
      aria-labelledby="position-ledger-heading"
      className="matchup-lineup"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-xl font-bold" id="position-ledger-heading">
          Picks by game
        </h2>
        <p className="text-muted text-xs">Kickoff order · All times Eastern</p>
      </div>
      {games.map((game) => {
        const unrevealed =
          game.selfSelected ||
          game.opponentSelected ||
          game.rows.some((row) => row.eventState === "SCHEDULED");
        const status = game.completed
          ? "Settled"
          : game.rows.some((row) => row.section === "IN_PROGRESS")
            ? "In progress"
            : "Upcoming";
        const title = (
          <>
            <span className="block text-sm font-bold">{game.eventLabel}</span>
            <span className="text-muted mt-1 block text-xs font-normal">
              <time dateTime={game.scheduledStartAt}>
                {easternTime(game.scheduledStartAt)}
              </time>{" "}
              · {status}
            </span>
          </>
        );
        const markets = lineupMarkets.filter((market) =>
          game.rows.some((row) => row.marketType === market),
        );
        const column = (
          side: "SELF" | "OPPONENT",
          market?: (typeof lineupMarkets)[number],
        ) => {
          const member = side === "SELF" ? matchup.self : matchup.opponent;
          const rows = game.rows.filter(
            (row) =>
              row.side === side && (!market || row.marketType === market),
          );
          const selected =
            side === "SELF" ? game.selfSelected : game.opponentSelected;
          const hidden =
            rows.length === 0 &&
            (selected || (unrevealed && member.selectedGames === undefined));
          return (
            <div
              className={`lineup-side ${side === "SELF" ? "lineup-self" : "lineup-opponent"} ${hidden ? "lineup-hidden-side" : ""}`}
              key={side}
              role="group"
              data-member-name={member.displayName}
              data-game-selected={selected ? "true" : undefined}
              aria-label={`${member.displayName} · ${game.eventLabel}${market ? ` · ${market.toLowerCase()}` : ""}`}
            >
              <p className="sr-only">{member.displayName}</p>
              {rows.length ? (
                <ul className="lineup-bets">
                  {rows.map((row) => (
                    <Bet row={row} key={row.id} />
                  ))}
                </ul>
              ) : hidden ? (
                <div className="lineup-hidden">
                  <p className="lineup-hidden-title">
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="5" y="10" width="14" height="11" rx="2" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
                    </svg>
                    <span>{selected ? "Bet placed" : "Picks hidden"}</span>
                  </p>
                  <p className="text-muted mt-1 text-xs leading-5">
                    {selected
                      ? "Bets hidden until confirmed kickoff"
                      : "Picks hidden until confirmed kickoff"}
                  </p>
                </div>
              ) : (
                <p className="lineup-empty text-muted text-xs leading-5">
                  {market ? "No bet in this market" : "No bet on this game"}
                </p>
              )}
            </div>
          );
        };
        // One sealed placeholder for the whole game; never imply a hidden count or market.
        const contents = unrevealed ? (
          <div className="lineup-pair">
            {column("SELF")}
            {column("OPPONENT")}
          </div>
        ) : (
          markets.map((market) => (
            <div className="lineup-pair" key={market}>
              {column("SELF", market)}
              {column("OPPONENT", market)}
            </div>
          ))
        );
        const total = (side: "SELF" | "OPPONENT") =>
          formatCenticredits(
            BigInt(
              game.rows
                .filter((row) => row.side === side)
                .reduce((sum, row) => sum + (row.returnedCenticredits ?? 0), 0),
            ),
            true,
          );
        return (
          <section
            className="lineup-game"
            key={game.eventId}
            data-event-id={game.eventId}
            aria-label={game.eventLabel}
          >
            {game.completed ? (
              <CompletedGame
                title={title}
                summary={`Returned · ${matchup.self.displayName} ${total("SELF")} · ${matchup.opponent.displayName} ${total("OPPONENT")}`}
              >
                {contents}
              </CompletedGame>
            ) : (
              <>
                <div className="lineup-game-title">{title}</div>
                {contents}
              </>
            )}
          </section>
        );
      })}
      {matchup.futureSealed && !matchup.gameIdentitiesVisible ? (
        <div
          aria-label="Future picks sealed. Unstarted events remain private."
          className="border-boundary bg-subtle mt-3 flex min-h-24 items-center justify-center rounded-lg border p-5 text-center"
          data-testid="future-sealed-placeholder"
        >
          <div>
            <p className="font-semibold">Future picks sealed</p>
            <p className="text-muted mt-1 text-xs">
              Unstarted events remain private.
            </p>
          </div>
        </div>
      ) : null}
      {!games.length && !matchup.futureSealed ? (
        <p className="text-muted py-6 text-sm">No submitted bets to show.</p>
      ) : null}
    </section>
  );
}
