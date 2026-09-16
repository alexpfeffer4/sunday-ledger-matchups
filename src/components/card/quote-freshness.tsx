import type { QuoteFreshnessData } from "@/application/providers/stored-quote-updates";
export function QuoteFreshness({
  freshness,
  family,
  delayed = false,
}: {
  freshness?: QuoteFreshnessData;
  family?: string;
  delayed?: boolean;
}) {
  const values =
    freshness?.filter((item) => !family || item.family === family) ?? [];
  if (!values.length && !delayed) return null;
  const checked = values
    .map((item) => item.checkedAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0];
  const age = checked
    ? Math.max(
        0,
        Math.floor(
          (Date.parse(values[0]?.readAt ?? checked) - Date.parse(checked)) /
            60_000,
        ),
      )
    : null;
  return (
    <p className="text-muted mt-1 text-xs">
      {age === null
        ? "Odds check pending"
        : age < 1
          ? "Odds checked just now"
          : `Odds checked ${age} minute${age === 1 ? "" : "s"} ago`}
      {delayed || values.some((item) => item.delayed)
        ? " · Updates delayed"
        : ""}
    </p>
  );
}
