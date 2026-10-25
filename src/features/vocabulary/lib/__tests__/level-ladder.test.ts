import { describe, expect, it } from "vitest";
import { catalogFor } from "../catalog-source";
import { buildLevelLadders } from "../level-ladder";

const LOCALES = ["en", "zh", "ko", "ja", "fr", "de", "es"] as const;

describe("level ladder snapshot", () => {
  // The bundled picker data IS this snapshot: `vitest -u` rewrites it, and a catalog
  // change that leaves it stale fails here instead of showing readers old counts.
  it("matches the compiled catalogs", async () => {
    const json = `${JSON.stringify(buildLevelLadders(catalogFor, LOCALES), null, 2)}\n`;
    await expect(json).toMatchFileSnapshot("../../data/level-ladder.json");
  });
});
