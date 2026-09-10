import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createElement as h } from "react";
import { ImageResponse } from "next/og.js";

const root = resolve(import.meta.dirname, "..");
const source = await readFile(
  resolve(root, "src/design/identity/lockups/horizontal.svg"),
  "utf8",
);
// Keep approved geometry; omit historical review-package metadata.
const lockup = source.replace(/<(title|desc|metadata)>[\s\S]*?<\/\1>/g, "");
const image = new ImageResponse(
  h(
    "div",
    {
      style: {
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#214E3E",
        padding: "52px",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          width: "100%",
          background: "#F4F6F3",
          borderRadius: "20px",
          padding: "52px 64px",
          color: "#18201D",
        },
      },
      h("img", {
        src: `data:image/svg+xml;base64,${Buffer.from(lockup).toString("base64")}`,
        width: 330,
        height: 64,
      }),
      h(
        "div",
        {
          style: {
            display: "flex",
            marginTop: "56px",
            color: "#9A4F20",
            fontSize: "24px",
            letterSpacing: "4px",
          },
        },
        "LEAGUE INVITATION",
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            marginTop: "12px",
            fontSize: "100px",
            letterSpacing: "-5px",
            lineHeight: 1.05,
          },
        },
        "You're invited.",
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            marginTop: "28px",
            fontSize: "32px",
            color: "#3F4A44",
          },
        },
        "Make your picks. Meet your weekly rival.",
      ),
    ),
  ),
  { width: 1200, height: 630 },
);

await writeFile(
  resolve(root, "src/app/join/opengraph-image.png"),
  Buffer.from(await image.arrayBuffer()),
);
console.log("Generated the static 1200 × 630 league invitation preview.");
