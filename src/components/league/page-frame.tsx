import type { ReactNode } from "react";

export function PageFrame({
  children,
  eyebrow,
  title,
  description,
  aside,
  dark = false,
  compact = true,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description?: string;
  aside?: ReactNode;
  dark?: boolean;
  compact?: boolean;
}) {
  return (
    <main
      className={
        dark
          ? "broadcast-dark bg-canvas min-h-[calc(100vh-6.5rem)] pb-24 lg:pb-12"
          : "pb-24 lg:pb-12"
      }
    >
      <div
        className={`mx-auto max-w-[1480px] min-w-0 px-4 [overflow-wrap:anywhere] sm:px-6 lg:px-8 ${compact ? "py-5 sm:py-6" : "py-7 sm:py-9"}`}
      >
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p
              className={
                compact ? "sr-only" : "text-muted text-sm font-semibold"
              }
            >
              {eyebrow}
            </p>
            <h1
              className={`text-ink font-bold tracking-[-0.025em] ${
                compact
                  ? "text-xl leading-7 sm:text-2xl sm:leading-8"
                  : "mt-2 text-[1.75rem] leading-9 tracking-[-0.035em] sm:text-[2rem]"
              }`}
            >
              {title}
            </h1>
            {description ? (
              <p className="text-graphite mt-2 max-w-2xl text-sm leading-6 sm:text-base">
                {description}
              </p>
            ) : null}
          </div>
          {aside}
        </div>
        {children}
      </div>
    </main>
  );
}
