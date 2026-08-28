const separators = /[^a-z0-9]+/g;
const edgeHyphens = /^-+|-+$/g;

export function leagueSlugBase(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(separators, "-")
    .replace(edgeHyphens, "")
    .slice(0, 48)
    .replace(/-+$/g, "");

  return normalized || "league";
}

export function createLeagueSlug(name: string, suffix: string): string {
  const safeSuffix = suffix.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (safeSuffix.length < 4) {
    throw new Error("A league URL suffix requires at least four characters.");
  }
  return `${leagueSlugBase(name)}-${safeSuffix}`;
}
