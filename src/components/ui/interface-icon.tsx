export type InterfaceIconName = "chevron-down" | "close" | "switch";

const paths: Record<InterfaceIconName, string> = {
  "chevron-down": "m7 10 5 5 5-5",
  close: "M7 7l10 10M17 7 7 17",
  switch: "m8 8 4-4 4 4M16 16l-4 4-4-4",
};

export function InterfaceIcon({
  name,
  className = "size-4",
}: {
  name: InterfaceIconName;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
    >
      <path d={paths[name]} />
    </svg>
  );
}
