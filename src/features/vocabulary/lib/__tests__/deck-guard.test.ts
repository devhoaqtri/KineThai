import { describe, expect, it } from "vitest";
import { isDeckModule } from "../../../../../scripts/deck-guard-plugin";

const data = "/repo/src/features/vocabulary/data";

describe("isDeckModule", () => {
  it("catches every deck location and the loader", () => {
    for (const id of [
      `${data}/catalog.json`,
      `${data}/packs/en-a1.json`,
      `${data}/de/de-a1.json`,
      `${data}/zh/hsk1.json?import`,
      "/repo/src/features/vocabulary/lib/catalog-source.ts",
    ]) {
      expect(isDeckModule(id), id).toBe(true);
    }
  });
  it("leaves the client's own data alone", () => {
    for (const id of [
      `${data}/level-ladder.json`,
      `${data}/share-codes.json`,
      `${data}/hanzi-strokes-version.ts`,
      "/repo/src/features/vocabulary/lib/custom-pack.ts",
    ]) {
      expect(isDeckModule(id), id).toBe(false);
    }
  });
  it("reads Windows paths", () => {
    expect(isDeckModule("C:\\repo\\src\\features\\vocabulary\\data\\fr\\fr-a1.json")).toBe(true);
  });
});
