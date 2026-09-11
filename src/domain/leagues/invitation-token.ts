// Accept copied invitations without navigating to another browser or fetching
// the supplied URL. The existing database RPC validates the token and limits.
export function invitationToken(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  let token = value.trim();
  if (/^https?:\/\//i.test(token) || token.startsWith("/join/")) {
    try {
      const link = new URL(token, "https://sunday-ledger.invalid");
      if (link.username || link.password) return null;
      const match = link.pathname.match(/^\/join\/([a-zA-Z0-9_-]{16,120})\/?$/);
      if (!match?.[1]) return null;
      token = match[1];
    } catch {
      return null;
    }
  }
  if (!/^[a-zA-Z0-9_-]{16,120}$/.test(token)) return null;
  return /^[a-fA-F0-9]{48}$/.test(token) ? token.toLowerCase() : token;
}
