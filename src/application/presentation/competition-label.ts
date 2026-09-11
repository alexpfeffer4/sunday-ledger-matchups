/** Presentation only: never infers a bye, qualification, or advancement. */
export function competitionLabel({
  lifecycle,
  postseasonRole,
  scope,
  week,
}: {
  lifecycle?: string;
  postseasonRole?:
    "CHAMPIONSHIP" | "THIRD_PLACE" | "PLACEMENT" | "EXHIBITION" | null;
  scope: "REGULAR" | "PLAYOFF" | "PLACEMENT" | "EXHIBITION";
  week: number;
}): string {
  if (scope === "EXHIBITION" || postseasonRole === "EXHIBITION") {
    return week === 18 ? "Week 18 exhibition" : "Exhibition";
  }
  if (postseasonRole === "CHAMPIONSHIP") {
    return lifecycle === "CHAMPION_FINAL"
      ? "Championship · champion final"
      : "Championship";
  }
  if (postseasonRole === "THIRD_PLACE") return "Third place";
  if (postseasonRole === "PLACEMENT" || scope === "PLACEMENT")
    return "Placement";
  return scope === "PLAYOFF" ? "Playoff" : "Regular season";
}
