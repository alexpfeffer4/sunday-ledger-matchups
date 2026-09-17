"use client";

import { clearBrowsingChoices } from "@/components/league/use-browsing-choices";
import { signOutAction } from "@/app/(auth)/auth/actions";

export function SignOutForm({
  className,
  role,
}: {
  className?: string;
  role?: "menuitem";
}) {
  return (
    <form action={signOutAction} onSubmit={clearBrowsingChoices}>
      <button className={className} role={role} type="submit">
        Sign out
      </button>
    </form>
  );
}
