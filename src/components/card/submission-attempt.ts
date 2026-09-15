// A logical batch keeps its identity through retries, navigation and reconnects.
// No receipt or game visibility is inferred from this local intent.
const memoryAttempts = new Map<string, { id: string; content: string }>();

export function clearSubmissionAttempt(storageKey: string): void {
  const key = `${storageKey}:submission-attempt`;
  memoryAttempts.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // A terminal card must also forget its retry identity when storage fails.
  }
}

export function submissionAttemptId(
  storageKey: string,
  content: string,
): string {
  const key = `${storageKey}:submission-attempt`;
  let prior = memoryAttempts.get(key);
  try {
    const stored = localStorage.getItem(key);
    if (stored) prior = JSON.parse(stored) as typeof prior;
  } catch {
    // Storage refusal retains retry safety for the lifetime of this tab.
  }
  if (prior?.content === content && typeof prior.id === "string")
    return prior.id;
  const attempt = { id: crypto.randomUUID(), content };
  memoryAttempts.set(key, attempt);
  try {
    localStorage.setItem(key, JSON.stringify(attempt));
  } catch {
    /* tab memory remains */
  }
  return attempt.id;
}
