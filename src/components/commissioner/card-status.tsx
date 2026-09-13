import type { CommissionerCardStatus } from "@/application/queries/get-commissioner-card-status";

export function CommissionerCardStatusPanel({
  status,
}: {
  status: CommissionerCardStatus | null;
}) {
  const sealed =
    status?.cards.filter((card) => card.sealed === true).length ?? 0;
  return (
    <section
      aria-labelledby="commissioner-card-status"
      className="border-boundary bg-surface mt-5 rounded-lg border p-4"
    >
      <h2 id="commissioner-card-status" className="font-bold">
        {status ? `Week ${status.nflWeek} cards` : "Card status"}
      </h2>
      <p className="text-muted mt-1 text-sm">
        Commissioner only · Picks and stakes stay private.
      </p>
      {status && status.cards.length > 0 ? (
        <>
          <p className="mt-3 font-semibold">
            {sealed} of {status.cards.length} cards sealed
          </p>
          <ul className="divide-boundary mt-2 divide-y">
            {status.cards.map((card) => (
              <li
                key={card.entryId}
                className="flex min-h-12 items-center justify-between gap-4 py-2 text-sm"
              >
                <span className="min-w-0 break-words">{card.displayName}</span>
                <span
                  className={`shrink-0 font-semibold ${card.sealed === true ? "text-registry" : "text-muted"}`}
                >
                  {card.sealed === null
                    ? "Status unavailable"
                    : card.sealed
                      ? "Sealed"
                      : "Not sealed"}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted mt-2 text-sm">
            Only accepted cards count as sealed. The published deadline applies
            even if someone has not sealed.
          </p>
        </>
      ) : (
        <p className="text-muted mt-3 text-sm">
          Card status is unavailable. Refresh this page to check again.
        </p>
      )}
    </section>
  );
}
