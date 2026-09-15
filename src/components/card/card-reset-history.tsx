import Link from "next/link";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import { formatCredits } from "@/domain/odds/american";

export function CardResetNotice({ week }: { week: number }) {
  return (
    <p
      role="status"
      className="border-boundary bg-surface rounded-lg border p-4 text-sm leading-6"
    >
      Your Week {week} picks were reset for the player-props launch. Make new
      picks with your available credits. The original receipts remain in the
      audit history.
    </p>
  );
}

export function CardResetHistory({
  leagueSlug,
  receipts,
}: {
  leagueSlug: string;
  receipts: NonNullable<
    NonNullable<Stage1StateDto["ownerCard"]>["resetReceipts"]
  >;
}) {
  if (!receipts.length) return null;
  return (
    <details className="border-boundary mt-5 rounded-lg border p-4 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        Reset receipt history
      </summary>
      <p className="text-graphite mt-2 leading-6">
        These original picks were superseded by the recorded reset. They do not
        use your available credits or contribute to this week’s score.
      </p>
      <ul className="divide-boundary mt-3 divide-y">
        {receipts.map((receipt) => (
          <li key={receipt.id} className="py-3">
            <p className="text-muted">{receipt.eventLabel}</p>
            <Link
              className="text-action inline-flex min-h-11 items-center font-semibold underline"
              href={`/l/${leagueSlug}/receipt/${receipt.id}`}
            >
              {receipt.proposition}
            </Link>
            <p>{formatCredits(receipt.stakeCredits)} credits · Reset</p>
            <p className="text-muted mt-2 font-mono text-xs break-all">
              {receipt.receiptHash}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
