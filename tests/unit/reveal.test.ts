import { describe, expect, it } from "vitest";
import { projectOpponentCard } from "@/domain/reveal/project-card";

describe("sealed opponent projection", () => {
  it("emits one generic future marker without hidden count or geometry", () => {
    expect(
      projectOpponentCard({
        revealableReceipts: [],
        hasAnyFutureSealedReceipt: true,
      }),
    ).toEqual({ revealed: [], futureSealed: true });
  });
});
