import type { ReactNode } from "react";

export function PageFrame({
  children,
  eyebrow,
  title,
  description,
  aside,
  dark = false,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description?: string;
  aside?: ReactNode;
  dark?: boolean;
}) {
  return (
    <main
      className={
        dark
          ? "broadcast-dark bg-canvas min-h-[calc(100vh-6.5rem)] pb-24 lg:pb-12"
          : "pb-24 lg:pb-12"
      }
    >
      <div className="mx-auto min-w-0 max-w-[1480px] px-4 py-7 [overflow-wrap:anywhere] sm:px-6 sm:py-9 lg:px-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-muted text-sm font-semibold">{eyebrow}</p>
            <h1 className="text-ink mt-2 text-[1.75rem] leading-9 font-bold tracking-[-0.035em] sm:text-[2rem]">
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
