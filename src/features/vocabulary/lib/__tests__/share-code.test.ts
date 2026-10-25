import { describe, expect, it } from "vitest";
import {
  SHARE_CODE_ALPHABET,
  SHARE_CODE_LENGTH,
  SHARE_CODE_SPACE,
  isShareCode,
  normalizeShareCode,
  randomShareCode,
} from "../share-code";

describe("format constants", () => {
  it("uses the 32-character Crockford alphabet", () =>
    expect(SHARE_CODE_ALPHABET).toHaveLength(32));
  it("excludes the four misread letters", () => {
    for (const letter of ["I", "L", "O", "U"]) expect(SHARE_CODE_ALPHABET).not.toContain(letter);
  });
  it("includes every digit", () => {
    for (const digit of "0123456789") expect(SHARE_CODE_ALPHABET).toContain(digit);
  });
  it("has three characters per code", () => expect(SHARE_CODE_LENGTH).toBe(3));
  it("covers 32^3 distinct codes", () => expect(SHARE_CODE_SPACE).toBe(32_768));
});

describe("normalizeShareCode", () => {
  it("uppercases a lowercase code", () => expect(normalizeShareCode("k7f")).toBe("K7F"));
  it("trims surrounding whitespace", () => expect(normalizeShareCode("  K7F ")).toBe("K7F"));
  it("drops inner spaces", () => expect(normalizeShareCode("K 7 F")).toBe("K7F"));
  it("drops dashes", () => expect(normalizeShareCode("K-7-F")).toBe("K7F"));
  it("drops underscores", () => expect(normalizeShareCode("k_7_f")).toBe("K7F"));
  it("folds I onto 1", () => expect(normalizeShareCode("I7F")).toBe("17F"));
  it("folds L onto 1", () => expect(normalizeShareCode("L7F")).toBe("17F"));
  it("folds O onto 0", () => expect(normalizeShareCode("O7F")).toBe("07F"));
  it("folds U onto V", () => expect(normalizeShareCode("U7F")).toBe("V7F"));
  it("folds lowercase misreads too", () => expect(normalizeShareCode("ilo")).toBe("110"));
  it("returns the empty string unchanged", () => expect(normalizeShareCode("")).toBe(""));
  it("leaves other characters alone", () => expect(normalizeShareCode("K7!")).toBe("K7!"));
});

describe("isShareCode", () => {
  it("accepts a canonical code", () => expect(isShareCode("K7F")).toBe(true));
  it("accepts a lowercase code", () => expect(isShareCode("k7f")).toBe(true));
  it("accepts a padded paste", () => expect(isShareCode(" k-7-f ")).toBe(true));
  it("accepts the misread letters after folding", () => expect(isShareCode("OLO")).toBe(true));
  it("rejects a two-character code", () => expect(isShareCode("K7")).toBe(false));
  it("rejects a four-character code", () => expect(isShareCode("K7FA")).toBe(false));
  it("rejects the empty string", () => expect(isShareCode("")).toBe(false));
  it("rejects a code with punctuation left after normalization", () =>
    expect(isShareCode("K7!")).toBe(false));
  it("rejects a whole shared URL, not just its code", () =>
    expect(isShareCode("anh.chayla.app/w/K7F")).toBe(false));
});

describe("randomShareCode", () => {
  it("produces a well-formed code from an injected source", () =>
    expect(isShareCode(randomShareCode(() => 0.5))).toBe(true));
  it("has the canonical length", () =>
    expect(randomShareCode(() => 0.1)).toHaveLength(SHARE_CODE_LENGTH));
  it("maps a zero draw onto the first alphabet character", () =>
    expect(randomShareCode(() => 0)).toBe("000"));
  it("maps a near-one draw onto the last alphabet character", () =>
    expect(randomShareCode(() => 0.999999)).toBe("ZZZ"));
  it("picks characters position by position", () => {
    let index = 0;
    const code = randomShareCode(() => [0, 1 / 32, 2 / 32][index++]!);
    expect(code).toBe("012");
  });
  it("uses the default source without throwing", () =>
    expect(isShareCode(randomShareCode())).toBe(true));
  it("produces varied codes across draws", () => {
    const codes = new Set(Array.from({ length: 200 }, () => randomShareCode()));
    expect(codes.size).toBeGreaterThan(150);
  });
  it("every generated code passes the validator", () => {
    for (let index = 0; index < 100; index += 1) expect(isShareCode(randomShareCode())).toBe(true);
  });
});
