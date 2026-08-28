import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sunday Ledger",
    short_name: "Sunday Ledger",
    description:
      "Private NFL matchup leagues scored with equal weekly virtual credits.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f3",
    theme_color: "#214e3e",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
