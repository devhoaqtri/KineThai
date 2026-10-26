import { describe, expect, it } from "vitest";
import { DEFAULT_CANVAS } from "../catalog";
import { parseCanvas, serializeCanvas } from "../serialize";

describe("parseCanvas", () => {
  it("falls back to the default for null", () => expect(parseCanvas(null)).toEqual(DEFAULT_CANVAS));
  it("falls back to the default for an empty string", () =>
    expect(parseCanvas("")).toEqual(DEFAULT_CANVAS));
  it("falls back to the default for undefined", () =>
    expect(parseCanvas(undefined)).toEqual(DEFAULT_CANVAS));
  it("merges stored fields over the defaults", () =>
    expect(parseCanvas('{"text":"hello"}').text).toBe("hello"));
  it("keeps every other default when only text is stored", () => {
    const spec = parseCanvas('{"text":"hello"}');
    expect(spec.text).toBe("hello");
    expect(spec.stickers).toEqual([]);
    expect(spec.font).toBe(DEFAULT_CANVAS.font);
  });
  it("keeps a stored sticker array", () => {
    const spec = parseCanvas('{"stickers":[{"word":"x"}]}');
    expect(spec.stickers).toHaveLength(1);
  });
  it("drops a non-array stickers field", () =>
    expect(parseCanvas('{"stickers":"nope"}').stickers).toEqual([]));
  it("treats invalid JSON as plain text", () =>
    expect(parseCanvas("đừng kể với ai nhé").text).toBe("đừng kể với ai nhé"));
  it("always returns an array of stickers", () =>
    expect(Array.isArray(parseCanvas("nonsense {").stickers)).toBe(true));
});

describe("serializeCanvas", () => {
  it("returns a JSON string", () => expect(typeof serializeCanvas(DEFAULT_CANVAS)).toBe("string"));
  it("round-trips through JSON.parse", () =>
    expect(JSON.parse(serializeCanvas(DEFAULT_CANVAS))).toEqual(DEFAULT_CANVAS));
  it("preserves text through a round trip", () => {
    const spec = { ...DEFAULT_CANVAS, text: "hello world" };
    expect(parseCanvas(serializeCanvas(spec)).text).toBe("hello world");
  });
  it("preserves stickers through a round trip", () => {
    const spec = {
      ...DEFAULT_CANVAS,
      stickers: [{ id: "s1", kind: "emoji" as const, word: "spark", x: 10, y: 20, size: 12 }],
    };
    expect(parseCanvas(serializeCanvas(spec)).stickers).toHaveLength(1);
  });
  it("matches JSON.stringify exactly", () =>
    expect(serializeCanvas(DEFAULT_CANVAS)).toBe(JSON.stringify(DEFAULT_CANVAS)));
});
