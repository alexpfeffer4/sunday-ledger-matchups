import exampleSeasonFixture from "./example-season.fixture.json";
import type { SimulationSeasonArchiveDto } from "@/application/queries/season-archive-dtos";

export const exampleSeasonSlug = "example-season";

/** Frozen, neutral schema-v1 teaching artifact. It is never persisted. */
export const exampleSeasonArchive =
  exampleSeasonFixture as unknown as SimulationSeasonArchiveDto;
