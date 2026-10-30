import { describe, expect, it } from "vitest";
import {
  hasExportStyles,
  isDeckModule,
  isExportModule,
} from "../../../../../scripts/deck-guard-plugin";

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

describe("isExportModule", () => {
  const vocabulary = "/repo/src/features/vocabulary";
  it("catches the local-only export tools", () => {
    for (const id of [
      `${vocabulary}/components/ExportStudio.tsx`,
      `${vocabulary}/components/ExportFramePage.tsx?tsr-split=component`,
      `${vocabulary}/components/ShowcasePage.tsx`,
      `${vocabulary}/components/CarouselFramePage.tsx`,
      `${vocabulary}/lib/slide-settle.ts`,
      `${vocabulary}/lib/export-recorder.ts`,
      `${vocabulary}/lib/export-presets.ts`,
      `${vocabulary}/vocabulary-export.css`,
      "/repo/src/features/post-player/hooks/usePostExport.ts",
      "/repo/src/features/post-player/lib/export-video.ts",
    ]) {
      expect(isExportModule(id), id).toBe(true);
    }
  });
  it("leaves what a reader needs alone", () => {
    for (const id of [
      `${vocabulary}/components/VocabularyCard.tsx`,
      `${vocabulary}/lib/export-layout.ts`,
      `${vocabulary}/vocabulary.css`,
      `${vocabulary}/hooks/useServedWord.ts`,
    ]) {
      expect(isExportModule(id), id).toBe(false);
    }
  });
});

describe("hasExportStyles", () => {
  it("finds the export sheet in a built stylesheet", () => {
    expect(hasExportStyles(".a{color:red}.vocab-export-record{color:red}")).toBe(true);
    expect(hasExportStyles(".vocab-intro-badge::after{inset:0}")).toBe(true);
  });
  it("ignores the reader's stylesheet", () => {
    expect(hasExportStyles(".vocab-card{color:red}.vocab-export-recording-note{}")).toBe(false);
  });
});
