import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(
  root,
  "src/design/identity/identity-manifest.json",
);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  return readFileSync(resolve(root, relativePath));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function svgInner(source) {
  return source
    .replace(/^[\s\S]*?<svg\b[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/\s*<title>[\s\S]*?<\/title>/g, "")
    .replace(/\s*<desc>[\s\S]*?<\/desc>/g, "")
    .replace(/\s*<metadata>[\s\S]*?<\/metadata>/g, "")
    .trim();
}

function verifySvg(relativePath) {
  const source = read(relativePath).toString("utf8");
  const viewBox = source.match(/\bviewBox="([^"]+)"/)?.[1];
  assert(source.trimStart().startsWith("<svg"), `${relativePath} is not SVG`);
  assert(viewBox, `${relativePath} has no viewBox`);
  const viewBoxValues = viewBox.split(/\s+/).map(Number);
  assert(
    viewBoxValues.length === 4 &&
      viewBoxValues.every(Number.isFinite) &&
      viewBoxValues[2] > 0 &&
      viewBoxValues[3] > 0,
    `${relativePath} has an invalid viewBox`,
  );

  const forbidden = [
    /<image\b/i,
    /data:image\//i,
    /(?:href|src)\s*=\s*["']https?:/i,
    /url\(\s*["']?https?:/i,
    /@font-face/i,
    /@import/i,
    /<(?:mask|filter|linearGradient|radialGradient)\b/i,
  ];
  for (const pattern of forbidden) {
    assert(!pattern.test(source), `${relativePath} contains ${pattern}`);
  }

  return source;
}

function pngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  assert(buffer.subarray(0, 8).toString("hex") === signature, "Invalid PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function decodePng(buffer) {
  const { width, height } = pngDimensions(buffer);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  assert(bitDepth === 8 && colorType === 6, "Expected an 8-bit RGBA PNG");

  const idat = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT")
      idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }

  const packed = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  let packedOffset = 0;

  function paeth(left, above, upperLeft) {
    const estimate = left + above - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const aboveDistance = Math.abs(estimate - above);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
      return left;
    }
    return aboveDistance <= upperLeftDistance ? above : upperLeft;
  }

  for (let y = 0; y < height; y += 1) {
    const filter = packed[packedOffset];
    packedOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[packedOffset];
      packedOffset += 1;
      const target = y * stride + x;
      const left = x >= bytesPerPixel ? pixels[target - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[target - stride] : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? pixels[target - stride - bytesPerPixel]
          : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : filter === 4
                  ? paeth(left, above, upperLeft)
                  : NaN;
      assert(Number.isFinite(predictor), `Unsupported PNG filter ${filter}`);
      pixels[target] = (raw + predictor) & 0xff;
    }
  }

  return { height, pixels, width };
}

function maskableMaxRadiusRatio(buffer) {
  const { width, height, pixels } = decodePng(buffer);
  const background = [33, 78, 62];
  let maxRadius = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = pixels[offset + 3];
      const distance =
        Math.abs(pixels[offset] - background[0]) +
        Math.abs(pixels[offset + 1] - background[1]) +
        Math.abs(pixels[offset + 2] - background[2]);
      if (alpha > 16 && distance > 12) {
        maxRadius = Math.max(
          maxRadius,
          Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2),
        );
      }
    }
  }

  return maxRadius / Math.min(width, height);
}

function icoDimensions(buffer) {
  assert(buffer.readUInt16LE(0) === 0, "Invalid ICO reserved field");
  assert(buffer.readUInt16LE(2) === 1, "Invalid ICO type");
  const count = buffer.readUInt16LE(4);
  const sizes = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    const width = buffer[offset] || 256;
    const height = buffer[offset + 1] || 256;
    assert(width === height, `ICO frame ${index} is not square`);
    sizes.push(width);
  }
  return sizes;
}

assert(manifest.schemaVersion === 1, "Unexpected identity manifest schema");
assert(
  manifest.sourcePackage.sha256 ===
    "6d04141da539c034bfd229cbafc22b6a8b2420fe4dcc4a1cad971a4a5b358208",
  "Unexpected approved package hash",
);
assert(
  Object.entries(manifest.socialPreviewPrivacy)
    .filter(
      ([key]) =>
        ![
          "approvedArtifact",
          "matchupArtifactFirst",
          "brandAttributionSecond",
        ].includes(key),
    )
    .every(([, value]) => value === false),
  "Social-preview privacy assessment has drifted",
);

for (const [path, , expectedHash] of manifest.canonicalSources) {
  assert(
    sha256(read(path)) === expectedHash,
    `${path} differs from the package`,
  );
}

for (const asset of manifest.exports) {
  const buffer = read(asset.path);
  assert(sha256(buffer) === asset.sha256, `${asset.path} has drifted`);
  if (asset.mimeType === "image/png") {
    const dimensions = pngDimensions(buffer);
    assert(
      dimensions.width === asset.width && dimensions.height === asset.height,
      `${asset.path} dimensions do not match the manifest`,
    );
  }
}

const svgPaths = manifest.canonicalSources.map(([path]) => path);
svgPaths.push("src/app/icon.svg");
for (const path of new Set(svgPaths)) verifySvg(path);

const opticalSources = Object.fromEntries(
  Object.entries(manifest.opticalMasters).map(([name, value]) => [
    name,
    svgInner(read(value.path).toString("utf8")),
  ]),
);
assert(
  new Set(Object.values(opticalSources)).size === 3,
  "Optical masters converged",
);
assert(
  manifest.opticalMasters.micro.minPx === 16 &&
    manifest.opticalMasters.micro.maxPx === 20 &&
    manifest.opticalMasters.compact.minPx === 24 &&
    manifest.opticalMasters.compact.maxPx === 32 &&
    manifest.opticalMasters.standard.minPx === 48 &&
    manifest.opticalMasters.standard.maxPx === null,
  "Optical size mapping has drifted",
);

const wordmark = read(
  "src/design/identity/masters/sunday-ledger-wordmark.svg",
).toString("utf8");
assert((wordmark.match(/<path\b/g) ?? []).length >= 10, "Wordmark lacks paths");
assert(
  !/<text\b|font-family|@font-face/i.test(wordmark),
  "Wordmark is not outlined",
);

const horizontalGeometry = svgInner(
  read("src/design/identity/lockups/horizontal.svg").toString("utf8"),
);
for (const name of ["reversed", "monochrome", "one-color"]) {
  assert(
    svgInner(
      read(`src/design/identity/lockups/${name}.svg`).toString("utf8"),
    ) === horizontalGeometry,
    `${name} lockup geometry differs from the approved horizontal lockup`,
  );
}

const ico = manifest.exports.find((asset) =>
  asset.path.endsWith("favicon.ico"),
);
assert(ico, "Favicon is absent from the export manifest");
assert(
  JSON.stringify(icoDimensions(read(ico.path))) ===
    JSON.stringify([16, 20, 24, 32, 48, 64]),
  "Favicon does not contain the approved optical frames",
);

for (const asset of manifest.exports.filter(
  (entry) => entry.purpose === "maskable",
)) {
  const ratio = maskableMaxRadiusRatio(read(asset.path));
  assert(
    ratio <= 0.4,
    `${asset.path} foreground leaves the maskable safe region`,
  );
  assert(
    Math.abs(ratio - asset.maxRadiusRatio) <= 0.015,
    `${asset.path} safe-region result differs from the approved package`,
  );
}

const monochrome = decodePng(read("public/identity/monochrome-512.png"));
const monochromeColors = new Set();
for (let offset = 0; offset < monochrome.pixels.length; offset += 4) {
  if (monochrome.pixels[offset + 3] > 0) {
    monochromeColors.add(
      `${monochrome.pixels[offset]},${monochrome.pixels[offset + 1]},${monochrome.pixels[offset + 2]}`,
    );
  }
}
assert(
  monochromeColors.size === 1,
  "Monochrome export has multiple effective colors",
);

const applicationManifest = read("src/app/manifest.ts").toString("utf8");
for (const asset of manifest.exports.filter((entry) => entry.purpose)) {
  const publicPath = asset.path.startsWith("public/")
    ? asset.path.slice("public".length)
    : "/icon.svg";
  assert(
    applicationManifest.includes(publicPath),
    `${publicPath} is missing from the app manifest`,
  );
  assert(
    applicationManifest.includes(`purpose: "${asset.purpose}"`),
    `${publicPath} purpose is missing from the app manifest`,
  );
}

const oldRegisterPath = "M11 8V55H56M27 24H48M27 46H56";
assert(
  !read("src/app/icon.svg").toString("utf8").includes(oldRegisterPath),
  "Old identity geometry remains in the browser icon",
);
assert(
  sha256(read("src/app/favicon.ico")) === ico.sha256,
  "The approved favicon did not replace the previous favicon",
);

const social = read("src/design/identity/root-social-preview.svg").toString(
  "utf8",
);
assert(
  !/<image\b|(?:href|src)\s*=\s*["']https?:/i.test(social),
  "Social preview has an external or raster embed",
);
assert(
  sha256(read("src/app/opengraph-image.png")) ===
    "1f0b388cad8821e9d5276e782bf1c55ffe1e787df077d158db7def1895221435",
  "Root social preview differs from the approved privacy-reviewed export",
);
assert(
  !existsSync(resolve(root, "src/app/apple-icon.tsx")) &&
    !existsSync(resolve(root, "src/app/opengraph-image.tsx")),
  "A legacy dynamic metadata asset would duplicate an approved static export",
);

console.log(
  `Identity verification passed: ${new Set(svgPaths).size} SVGs, ${manifest.exports.length} exports, favicon frames 16/20/24/32/48/64, maskable and monochrome checks.`,
);
