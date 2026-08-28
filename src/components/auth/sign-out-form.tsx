import { signOutAction } from "@/app/(auth)/auth/actions";

export function SignOutForm({ className }: { className?: string }) {
  return (
    <form action={signOutAction}>
      <button className={className} type="submit">
        Sign out
      </button>
    </form>
  );
}
