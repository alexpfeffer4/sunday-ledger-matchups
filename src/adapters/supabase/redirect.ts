const internalOrigin = "https://sunday-ledger.invalid";

export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/leagues",
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, internalOrigin);
    if (parsed.origin !== internalOrigin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
