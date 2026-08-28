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
        d="M11 8V55H56M27 24H48M27 46H56"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="text-registry inline-flex items-center gap-3">
      <RegisterMark className="h-[1.875rem] w-[1.875rem] shrink-0" />
      {!compact ? (
        <span className="text-ink text-[17px] font-[750] tracking-[-0.03em]">
          Sunday Ledger
        </span>
      ) : null}
    </span>
  );
}
