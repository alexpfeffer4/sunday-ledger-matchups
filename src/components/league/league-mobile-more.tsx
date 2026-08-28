"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { LeagueNavIcon } from "@/components/league/league-nav-icon";
import { InterfaceIcon } from "@/components/ui/interface-icon";

const itemClass =
  "text-graphite hover:bg-subtle hover:text-ink flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold";

export function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function useProfileMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return { containerRef, menuId, open, setOpen, triggerRef };
}

function ProfileHeader({
  memberName,
  memberRole,
}: {
  memberName: string;
  memberRole: string;
}) {
  return (
    <div className="border-boundary flex items-center gap-3 border-b px-3 pb-3">
      <span className="border-registry bg-subtle text-registry flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
        {initials(memberName)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{memberName}</p>
        <p className="text-muted truncate text-xs">{memberRole}</p>
      </div>
    </div>
  );
}

export function LeagueMobileMore({
  leagueSlug,
  isCommissioner,
  memberName,
  memberRole,
}: {
  leagueSlug: string;
  isCommissioner: boolean;
  memberName: string;
  memberRole: string;
}) {
  const { containerRef, menuId, open, setOpen, triggerRef } = useProfileMenu();

  return (
    <div className="relative lg:hidden" ref={containerRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open profile menu"
        className="border-control bg-surface text-registry hover:bg-subtle flex size-11 items-center justify-center rounded-full border text-xs font-bold"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        {initials(memberName)}
      </button>
      {open ? (
        <>
          <button
            aria-label="Close profile menu"
            className="bg-ink/15 fixed inset-0 z-40 cursor-default backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div
            className="border-boundary bg-surface fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border p-3 shadow-[var(--shadow-modal)]"
            id={menuId}
            aria-label="Profile menu"
            aria-modal="true"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <ProfileHeader
                  memberName={memberName}
                  memberRole={memberRole}
                />
              </div>
              <button
                aria-label="Close profile menu"
                className="text-muted hover:bg-subtle hover:text-ink flex size-10 shrink-0 items-center justify-center rounded-full"
                onClick={() => setOpen(false)}
                type="button"
              >
                <InterfaceIcon name="close" />
              </button>
            </div>
            <nav aria-label="League and account" className="mt-2">
              <Link
                className={itemClass}
                href="/leagues"
                onClick={() => setOpen(false)}
              >
                <LeagueNavIcon name="league" />
                Your leagues
              </Link>
              <Link
                className={itemClass}
                href="/account"
                onClick={() => setOpen(false)}
              >
                <LeagueNavIcon name="account" />
                Account
              </Link>
              <Link
                className={itemClass}
                href={`/l/${leagueSlug}/rules`}
                onClick={() => setOpen(false)}
              >
                <LeagueNavIcon name="rules" />
                Rules &amp; trust
              </Link>
              {isCommissioner ? (
                <Link
                  className={itemClass}
                  href={`/l/${leagueSlug}/commissioner`}
                  onClick={() => setOpen(false)}
                >
                  <LeagueNavIcon name="commissioner" />
                  Commissioner
                </Link>
              ) : null}
            </nav>
            <div className="border-boundary mt-2 border-t pt-2">
              <SignOutForm className={`${itemClass} w-full`} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function LeagueDesktopProfileMenu({
  memberName,
  memberRole,
}: {
  memberName: string;
  memberRole: string;
}) {
  const { containerRef, menuId, open, setOpen, triggerRef } = useProfileMenu();

  return (
    <div className="relative hidden lg:block" ref={containerRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open account menu"
        className="hover:bg-subtle flex min-h-12 w-full items-center justify-center rounded-lg px-2 xl:justify-start xl:gap-3"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span className="border-registry bg-subtle text-registry flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
          {initials(memberName)}
        </span>
        <span className="hidden min-w-0 flex-1 text-left xl:block">
          <span className="block truncate text-sm font-semibold">
            {memberName}
          </span>
          <span className="text-muted block truncate text-xs">
            {memberRole}
          </span>
        </span>
        <InterfaceIcon
          name="chevron-down"
          className={`text-muted hidden size-4 transition-transform xl:block ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          className="border-boundary bg-surface absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border p-2 shadow-[var(--shadow-card)]"
          id={menuId}
          aria-label="Account menu"
          role="dialog"
        >
          <ProfileHeader memberName={memberName} memberRole={memberRole} />
          <nav aria-label="Account options" className="mt-2">
            <Link
              className={itemClass}
              href="/leagues"
              onClick={() => setOpen(false)}
            >
              <LeagueNavIcon name="league" />
              Your leagues
            </Link>
            <Link
              className={itemClass}
              href="/account"
              onClick={() => setOpen(false)}
            >
              <LeagueNavIcon name="account" />
              Account
            </Link>
          </nav>
          <div className="border-boundary mt-2 border-t pt-2">
            <SignOutForm className={`${itemClass} w-full`} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
