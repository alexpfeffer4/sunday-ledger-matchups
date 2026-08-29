"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { initials } from "@/components/league/initials";
import { LeagueNavIcon } from "@/components/league/league-nav-icon";
import { Dialog } from "@/components/ui/dialog";
import { InterfaceIcon } from "@/components/ui/interface-icon";

const itemClass =
  "text-graphite hover:bg-subtle hover:text-ink flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold";

function useProfileMenu(focusFirstItem = false) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    if (focusFirstItem) {
      panelRef.current
        ?.querySelector<HTMLElement>("[role='menuitem']")
        ?.focus();
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
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
  }, [focusFirstItem, open]);

  return { containerRef, menuId, open, panelRef, setOpen, triggerRef };
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
        <p className="text-sm font-semibold break-words">{memberName}</p>
        <p className="text-muted text-xs break-words">{memberRole}</p>
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
  const { containerRef, open, setOpen, triggerRef } = useProfileMenu();

  return (
    <div className="relative lg:hidden" ref={containerRef}>
      <button
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
      <Dialog
        description={memberRole}
        onClose={() => setOpen(false)}
        open={open}
        returnFocusRef={triggerRef}
        title={memberName}
        variant="sheet"
      >
        <nav aria-label="League and account">
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
      </Dialog>
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
  const { containerRef, menuId, open, panelRef, setOpen, triggerRef } =
    useProfileMenu(true);

  function moveMenuFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']"),
    );
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (currentIndex + 1) % items.length
            : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  return (
    <div className="relative hidden lg:block" ref={containerRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
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
          <span className="block text-sm font-semibold break-words">
            {memberName}
          </span>
          <span className="text-muted block text-xs break-words">
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
          ref={panelRef}
        >
          <ProfileHeader memberName={memberName} memberRole={memberRole} />
          <div
            aria-label="Account menu"
            id={menuId}
            onKeyDown={moveMenuFocus}
            role="menu"
          >
            <div className="mt-2" role="group">
              <Link
                className={itemClass}
                href="/leagues"
                onClick={() => setOpen(false)}
                role="menuitem"
              >
                <LeagueNavIcon name="league" />
                Your leagues
              </Link>
              <Link
                className={itemClass}
                href="/account"
                onClick={() => setOpen(false)}
                role="menuitem"
              >
                <LeagueNavIcon name="account" />
                Account
              </Link>
            </div>
            <div className="border-boundary mt-2 border-t pt-2" role="group">
              <SignOutForm className={`${itemClass} w-full`} role="menuitem" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
