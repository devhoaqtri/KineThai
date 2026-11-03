/**
 * The reader's merged catalog is built by glob-sorting every deck file, then letting
 * the first pack win on headword collisions (schema.ts:mergeCatalogs). A newer deck
 * file shadows an older one only when its path sorts BEFORE the older path, so an
 * alphabetically-later name silently keeps the OLD prose.
 *
 * K101–K105 v3.7 arrived as a content refresh (better prose, pronKo, hanViet) on
 * words that already live in `topik-1.json`. It ships as `topik-1-k101-k105.json`,
 * which sorts first because `-` (0x2D) < `.` (0x2E). If a future rename or a new
 * batch pushes the file later in the sort, the reader quietly loses v3.7 without
 * any gate failing. These tests are the tripwire.
 */
import { describe, expect, it } from "vitest";
import { catalogFor } from "../catalog-source";

const ko = catalogFor("ko");

// v3.7 rewrote these three leadVi sentences; the shipped pre-v3.7 forms do not
// contain these fragments. If a rename or a glob-order change shadows v3.7 out,
// the merged catalog falls back to the older prose and this assertion fails.
const V37_LEAD_FRAGMENTS: Record<string, string> = {
  것: "Mở tủ", // vs shipped "/Đói_bụng/ | là lục tung bếp…"
  길: "Giờ tan", // vs shipped "Hỏi người bán nước | để biết /rẽ/…"
  컵: "Sáng nào cũng rót", // vs shipped "Sáng ra | /rót/ sữa ấm…"
};

describe("ko deck merge order", () => {
  for (const [word, fragment] of Object.entries(V37_LEAD_FRAGMENTS)) {
    it(`serves the v3.7 leadVi for ${word}`, () => {
      const card = ko.words.find((entry) => entry.word === word);
      expect(card, `${word} present in the merged ko catalog`).toBeTruthy();
      expect(card!.leadVi ?? "").toContain(fragment);
    });
  }
  it("keeps TOPIK1 at 778 words after the shadow-first import", () => {
    // v3.7 covers 445 of them; the older shipped pack still contributes the other 333
    // (K106+ hasn't been re-exported). Shadow-first merge must not double-count.
    const topik1 = ko.words.filter((entry) => entry.level === "TOPIK1");
    expect(topik1.length).toBe(778);
  });
});
