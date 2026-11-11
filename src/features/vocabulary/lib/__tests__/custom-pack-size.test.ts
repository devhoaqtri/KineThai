import { describe, expect, it } from "vitest";
import { MAX_PACK_BYTES, packSizeError, parseCustomPack } from "../custom-pack";

describe("pack size limit", () => {
  it("lets a file of exactly 4 MB through", () => expect(packSizeError(MAX_PACK_BYTES)).toBeNull());

  it("names the file's size, the limit, why it is roomy and what to do", () => {
    const message = packSizeError(6.24 * 1024 * 1024)!;
    const lines = message.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Gói này nặng 6,2 MB, vượt mức 4 MB cho mỗi gói.");
    expect(lines[1]).toMatch(/5\.000 từ/);
    expect(lines[2]).toMatch(/tách thành vài gói nhỏ hơn/);
  });

  it("counts bytes, not characters: Vietnamese letters take more than one byte", () => {
    // 1.5M "ạ" is 1.5M characters but 4.5 MB in UTF-8.
    const text = `["${"ạ".repeat(1_500_000)}"]`;
    expect(text.length).toBeLessThan(MAX_PACK_BYTES);
    expect(() => parseCustomPack(text, "big.json")).toThrow(/vượt mức 4 MB/);
  });
});
