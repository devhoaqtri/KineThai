import { describe, expect, it } from "vitest";
import { MAX_PACK_BYTES, packSizeError, parseCustomPack } from "../custom-pack";

describe("pack size limit", () => {
  it("lets a file of exactly 4 MB through", () => expect(packSizeError(MAX_PACK_BYTES)).toBeNull());

  it("refuses a bigger file with one short line naming the limit", () =>
    expect(packSizeError(MAX_PACK_BYTES + 1)).toBe("Gói vượt quá giới hạn 4 MB."));

  it("counts bytes, not characters: Vietnamese letters take more than one byte", () => {
    // 1.5M "ạ" is 1.5M characters but 4.5 MB in UTF-8.
    const text = `["${"ạ".repeat(1_500_000)}"]`;
    expect(text.length).toBeLessThan(MAX_PACK_BYTES);
    expect(() => parseCustomPack(text, "big.json")).toThrow(/giới hạn 4 MB/);
  });
});
