import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { packLevelCounts, parseCustomPack } from "../custom-pack";

// The packs in public/sample-packs are for trying the library's upload by hand, by file or
// by link. Each must go through the real importer, in the format it stands for.
const read = (name: string) =>
  readFileSync(resolve(process.cwd(), "public/sample-packs", name), "utf8");

describe("sample packs", () => {
  it("du-lich-a2: the compiled shape, with its own name and levels", () => {
    const pack = parseCustomPack(read("du-lich-a2.json"), "du-lich-a2.json");
    expect(pack.catalog.name).toBe("Du lịch cơ bản (mẫu)");
    expect(pack.catalog.count).toBe(14);
    expect(pack.catalog.levels).toEqual(["A1", "A2"]);
  });

  it("nha-bep-b1: the WordCrawler batch shape, level taken from the file name", () => {
    const pack = parseCustomPack(read("nha-bep-b1.json"), "nha-bep-b1.json");
    expect(pack.catalog.name).toBe("nha-bep-b1");
    expect(pack.catalog.count).toBe(12);
    expect(packLevelCounts(pack)).toEqual([{ level: "B1", count: 12 }]);
    expect(pack.catalog.words[0]!.usage[0]!.en).toContain("_____");
    expect(pack.catalog.words[0]!.emphasis).toEqual(["nhỏ lửa"]);
  });

  it("cong-so-nhieu-cap: meta.name and five levels", () => {
    const pack = parseCustomPack(read("cong-so-nhieu-cap.json"), "cong-so-nhieu-cap.json");
    expect(pack.catalog.name).toBe("Công sở nhiều cấp độ (mẫu)");
    expect(packLevelCounts(pack).map((entry) => entry.level)).toEqual([
      "A1",
      "A2",
      "B1",
      "B2",
      "C1",
    ]);
  });

  it("goi-loi: refused with a readable message", () => {
    expect(() => parseCustomPack(read("goi-loi.json"), "goi-loi.json")).toThrow(
      "Không tìm thấy danh sách từ trong gói.",
    );
  });
});
