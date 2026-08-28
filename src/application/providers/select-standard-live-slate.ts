import type { LiveProviderEvent } from "@/application/providers/live-odds";

const easternCalendar = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  hour12: false,
});

function easternDayAndHour(value: string): { day: string; hour: number } {
  const parts = easternCalendar.formatToParts(new Date(value));
  const day = parts.find((part) => part.type === "weekday")?.value ?? "";
  const rawHour = Number(parts.find((part) => part.type === "hour")?.value);
  return { day, hour: rawHour === 24 ? 0 : rawHour };
}

export function isStandardLiveSlateEvent(event: LiveProviderEvent): boolean {
  const { day, hour } = easternDayAndHour(event.scheduledStartAt);
  return (day === "Sun" && hour >= 13) || day === "Mon";
}
