import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#214e3e",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <svg fill="none" height="112" viewBox="0 0 64 64" width="112">
        <path
          d="M11 8V55H56M27 24H48M27 46H56"
          stroke="#ffffff"
          strokeLinecap="square"
          strokeLinejoin="round"
          strokeWidth="6"
        />
      </svg>
    </div>,
    size,
  );
}
