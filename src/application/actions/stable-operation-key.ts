import { createHash } from "node:crypto";

export type StableOperationIntent =
  | boolean
  | null
  | number
  | string
  | readonly StableOperationIntent[]
  | { readonly [key: string]: StableOperationIntent };

/**
 * A logical intent keeps the same key across double-clicks, reconnects, and
 * reloads. Callers must include every reviewed input that would make a retry a
 * materially different command.
 */
export function stableOperationKey(intent: StableOperationIntent): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(intent))
    .digest("hex");
  return `op:${digest}`;
}
