import { ImageResponse } from "next/og";

export const alt = "Sunday Ledger — Build your card. Beat your matchup.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "#f4f6f3",
        color: "#18201d",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px 80px",
        width: "100%",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 22 }}>
        <svg fill="none" height="64" viewBox="0 0 64 64" width="64">
          <path
            d="M11 8V55H56M27 24H48M27 46H56"
            stroke="#214e3e"
            strokeLinecap="square"
            strokeLinejoin="round"
            strokeWidth="6"
          />
        </svg>
        <div
          style={{
            fontSize: 38,
            fontWeight: 750,
            letterSpacing: "-1.2px",
          }}
        >
          Sunday Ledger
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            color: "#214e3e",
            fontSize: 24,
            fontWeight: 700,
            marginBottom: 24,
          }}
        >
          Weekly NFL matchup leagues
        </div>
        <div
          style={{
            fontSize: 76,
            fontWeight: 750,
            letterSpacing: "-3.5px",
            lineHeight: 1.02,
            maxWidth: 950,
          }}
        >
          Build your card. Beat your matchup.
        </div>
      </div>

      <div
        style={{
          borderTop: "2px solid #d8e0db",
          color: "#46524d",
          display: "flex",
          fontSize: 22,
          justifyContent: "space-between",
          paddingTop: 24,
        }}
      >
        <span>1,000 credits each week</span>
        <span>Virtual credits only</span>
      </div>
    </div>,
    size,
  );
}
