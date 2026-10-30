import { describe, expect, it } from "vitest";
import { resolveTarget, siteAddress, siteBrand, siteTitle } from "../target-language";
import { readVocabularyPage } from "../../api/catalog.server";

describe("resolveTarget", () => {
  it("hoa.chayla.app serves Chinese", () => expect(resolveTarget("hoa.chayla.app")).toBe("zh"));
  it("anh.chayla.app serves English", () => expect(resolveTarget("anh.chayla.app")).toBe("en"));
  it("han.chayla.app serves Korean", () => expect(resolveTarget("han.chayla.app")).toBe("ko"));
  it("nhat.chayla.app serves Japanese", () => expect(resolveTarget("nhat.chayla.app")).toBe("ja"));
  it("phap.chayla.app serves French", () => expect(resolveTarget("phap.chayla.app")).toBe("fr"));
  it("duc.chayla.app serves German", () => expect(resolveTarget("duc.chayla.app")).toBe("de"));
  it("tbn.chayla.app serves Spanish", () => expect(resolveTarget("tbn.chayla.app")).toBe("es"));
  it("unknown host falls back to English", () =>
    expect(resolveTarget("foo.lovable.app")).toBe("en"));
  it("tolerates port and case", () => expect(resolveTarget("HOA.chayla.app:8080")).toBe("zh"));
  it("missing host falls back to English", () => expect(resolveTarget(null)).toBe("en"));
  it("Chinese title is hoa.chayLá", () => expect(siteTitle("zh")).toBe("hoa.chayLá"));
  it("French title is pháp.chayLá", () => expect(siteTitle("fr")).toBe("pháp.chayLá"));
  it("German title is đức.chayLá", () => expect(siteTitle("de")).toBe("đức.chayLá"));
  it("brand splits lead from the accent span", () => {
    expect(siteBrand("zh")).toEqual({ lead: "hoa.chay", accent: "Lá" });
    expect(siteBrand("en")).toEqual({ lead: "anh.chay", accent: "Lá" });
    expect(siteBrand("ja")).toEqual({ lead: "nhật.chay", accent: "Lá" });
    for (const locale of ["en", "zh", "ko", "ja", "fr", "de", "es"] as const) {
      const { lead, accent } = siteBrand(locale);
      expect(lead + accent).toBe(siteTitle(locale));
    }
  });
  it("every address resolves back to its own deck", () => {
    for (const locale of ["en", "zh", "ko", "ja", "fr", "de", "es"] as const) {
      expect(resolveTarget(siteAddress(locale))).toBe(locale);
    }
  });
});

describe("Chinese deck", () => {
  it("a hoa request returns only Chinese words", () => {
    const page = readVocabularyPage(
      { seed: "testseed01", position: 0, limit: 24, topic: "", level: "", difficulty: "" },
      "zh",
    );
    expect(page.entries.length).toBeGreaterThan(0);
    for (const e of page.entries) expect(e.word.word).toMatch(/^\p{Script=Han}+$/u);
  });
});

describe("French, German and Spanish decks", () => {
  const request = { seed: "testseed01", position: 0, limit: 24, topic: "", level: "", difficulty: "" } as const;
  it("a phap request returns only French words", () => {
    const page = readVocabularyPage(request, "fr");
    expect(page.entries.length).toBeGreaterThan(0);
    for (const e of page.entries) expect(e.word.word).not.toMatch(/^\p{Script=Han}+$/u);
  });
  it("a duc request returns only German words", () => {
    const page = readVocabularyPage(request, "de");
    expect(page.entries.length).toBeGreaterThan(0);
    for (const e of page.entries) expect(e.word.word).not.toMatch(/^\p{Script=Han}+$/u);
  });
  it("a tbn request returns only Spanish words", () => {
    const page = readVocabularyPage(request, "es");
    expect(page.entries.length).toBeGreaterThan(0);
    for (const e of page.entries) expect(e.word.word).not.toMatch(/^\p{Script=Han}+$/u);
  });
});
