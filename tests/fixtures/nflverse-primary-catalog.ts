import { playerCatalogWireFixture } from "./player-catalog-wire";
import type { NflverseCatalogFiles } from "@/adapters/providers/player-catalog-normalizer";

export function nflversePrimaryCatalogFixture(
  fixture = playerCatalogWireFixture(),
) {
  const nflverse: NflverseCatalogFiles = {
    ...fixture.nflverse,
    rosterCsv: fixture.nflverse.rosterCsv
      .split("\n")
      .map(
        (row, index) => row + (index === 0 ? ",espn_id" : `,${1000 + index}`),
      )
      .join("\n"),
  };
  return { ...fixture, nflverse };
}
