import { describe, expect, it } from "vitest";
import { isBackendAllowedForDeployment } from "@/adapters/supabase/config";

describe("Preview backend isolation", () => {
  const production = "https://nxikkhtaercmbuyrlyio.supabase.co";
  const isolatedRef = "abcdefghijklmnopqrst";
  const isolated = `https://${isolatedRef}.supabase.co`;

  it("blocks inherited Production credentials and an undeclared Preview backend", () => {
    expect(
      isBackendAllowedForDeployment(production, "preview", undefined),
    ).toBe(false);
    expect(
      isBackendAllowedForDeployment(
        production,
        "preview",
        "nxikkhtaercmbuyrlyio",
      ),
    ).toBe(false);
    expect(
      isBackendAllowedForDeployment(production, "preview", isolatedRef),
    ).toBe(false);
    expect(isBackendAllowedForDeployment(isolated, "preview", undefined)).toBe(
      false,
    );
  });

  it("allows only the explicitly declared isolated project over HTTPS", () => {
    expect(
      isBackendAllowedForDeployment(isolated, "preview", isolatedRef),
    ).toBe(true);
    for (const url of [
      isolated.replace("https:", "http:"),
      `${isolated}.example.org`,
      "invalid",
      `https://user@${isolatedRef}.supabase.co`,
    ]) {
      expect(isBackendAllowedForDeployment(url, "preview", isolatedRef)).toBe(
        false,
      );
    }
  });

  it("preserves Production and disposable local configuration", () => {
    expect(
      isBackendAllowedForDeployment(production, "production", undefined),
    ).toBe(true);
    expect(
      isBackendAllowedForDeployment(
        "http://127.0.0.1:54321",
        "development",
        undefined,
      ),
    ).toBe(true);
  });
});
