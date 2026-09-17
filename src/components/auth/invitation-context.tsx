import { getAuthInvitationContext } from "@/application/queries/get-auth-invitation-context";

export async function InvitationContext({ next }: { next: string }) {
  const invitation = await getAuthInvitationContext(next);
  if (!invitation) return null;

  return (
    <aside
      aria-label="League invitation"
      className="border-boundary bg-subtle mt-5 rounded-lg border p-4"
    >
      <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
        {invitation.leagueName
          ? "Your league invitation"
          : "Invitation unavailable"}
      </p>
      {invitation.leagueName ? (
        <>
          <p className="mt-2 font-bold [overflow-wrap:anywhere]">
            {invitation.leagueName}
          </p>
          <p className="text-graphite mt-2 text-sm leading-6">
            After account access, return to this invitation and choose Join
            league. Creating an account or signing in does not join it.
          </p>
        </>
      ) : (
        <p className="text-graphite mt-2 text-sm leading-6">
          We can’t confirm this invitation right now. You can continue with your
          account, but joining still requires an active invitation. Ask the
          commissioner for a current link if it remains unavailable.
        </p>
      )}
    </aside>
  );
}
