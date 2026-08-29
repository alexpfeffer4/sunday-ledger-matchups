import { signOutAction } from "@/app/(auth)/auth/actions";

export function SignOutForm({
  className,
  role,
}: {
  className?: string;
  role?: "menuitem";
}) {
  return (
    <form action={signOutAction}>
      <button className={className} role={role} type="submit">
        Sign out
      </button>
    </form>
  );
}
