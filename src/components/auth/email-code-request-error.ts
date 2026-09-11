import { unstable_rethrow } from "next/navigation";
import type { EmailCodeState } from "@/app/(auth)/auth/state";

export function emailCodeRequestError(error: unknown): EmailCodeState {
  // Successful authentication redirects are framework control flow, not
  // verification failures. Keep Next's redirect handling intact.
  unstable_rethrow(error);
  const message = error instanceof Error ? error.message : "";
  const stale =
    error instanceof Error &&
    (error.name === "UnrecognizedActionError" ||
      /failed to find server action|server action.*not found/i.test(message));
  return {
    status: "error",
    requestFailed: true,
    message: stale
      ? "This page is out of date. Reload it and request a new email, or use the link in your newest email."
      : "We couldn’t complete code verification. Try again, or use the link in your newest email. If this continues, reload this page and request a new email.",
  };
}
