import type { BeforeSend } from "@vercel/analytics/next";

// Measure navigation without sending authentication details or private identifiers.
export const sanitizeAnalyticsEvent: BeforeSend = (event) => {
  const url = new URL(event.url);
  if (/^\/(auth|owner)(\/|$)/.test(url.pathname)) return null;

  url.search = "";
  url.hash = "";
  url.pathname = url.pathname
    .replace(/^\/join\/[^/]+/, "/join/[token]")
    .replace(/^\/l\/[^/]+/, "/l/[leagueSlug]")
    .replace(/\/rivalry\/[^/]+\/[^/]+$/, "/rivalry/[memberA]/[memberB]")
    .replace(/\/receipt\/[^/]+$/, "/receipt/[receiptId]")
    .replace(/\/event\/[^/]+$/, "/event/[eventId]");
  return { ...event, url: url.toString() };
};
