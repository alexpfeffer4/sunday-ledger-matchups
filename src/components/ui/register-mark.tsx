export function RegisterMark({
  className = "h-7 w-7",
}: {
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13 9V54H55M29 25H52M29 45H55"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="text-registry inline-flex items-center gap-2.5">
      <RegisterMark className="h-7 w-7 shrink-0" />
      {!compact ? (
        <span className="text-ink text-[17px] font-bold tracking-[-0.025em]">
          Sunday Ledger
        </span>
      ) : null}
    </span>
  );
}
