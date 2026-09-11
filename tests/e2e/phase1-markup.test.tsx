import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import {
  InvitePreviewCard,
  SignedOutInviteActions,
} from "@/components/league/invite-public-preview";

test("render public invitation with real actions for browser acceptance", () => {
  const previewMarkup = renderToStaticMarkup(
    <main className="bg-canvas min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-xl">
        <InvitePreviewCard
          actions={<SignedOutInviteActions token="private-invite-token" />}
          preview={{
            commissioner_name: "Alex",
            expires_at: "2026-09-01T17:00:00.000Z",
            league_name: "Sunday Friends",
            member_count: 3,
            mode: "LIVE",
            nfl_year: 2026,
          }}
        />
      </div>
    </main>,
  );
  expect(previewMarkup).toContain("Sunday Friends");
  mkdirSync(resolve("tests/e2e/generated"), { recursive: true });
  writeFileSync(
    resolve("tests/e2e/generated/phase1-invitation.html"),
    previewMarkup,
  );
});
