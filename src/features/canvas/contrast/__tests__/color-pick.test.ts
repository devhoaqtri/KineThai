import { describe, expect, it } from "vitest";
import { getCanvasBackgroundColors, pickBestColor } from "../color-pick";

describe("getCanvasBackgroundColors", () => {
  it("returns nothing without a background or gradient path", () =>
    expect(getCanvasBackgroundColors({ backgroundStyle: "static" })).toEqual([]));
  it("collects colors from a transition gradient path", () => {
    const colors = getCanvasBackgroundColors({
      backgroundStyle: "transition",
      gradientPath: ["linear-gradient(135deg,#ff0000,#00ff00)"],
    });
    expect(colors).toHaveLength(2);
    expect(colors[0]).toEqual({ r: 255, g: 0, b: 0 });
    expect(colors[1]).toEqual({ r: 0, g: 255, b: 0 });
  });
  it("ignores the gradient path unless the style is transition", () =>
    expect(
      getCanvasBackgroundColors({
        backgroundStyle: "static",
        gradientPath: ["linear-gradient(135deg,#ff0000,#00ff00)"],
      }),
    ).toEqual([]));
  it("filters null and empty entries out of an array background", () => {
    const colors = getCanvasBackgroundColors(
      { backgroundStyle: "static" },
      ["linear-gradient(135deg,#ffffff,#000000)", null, ""],
    );
    expect(colors).toHaveLength(2);
    expect(colors[0]).toEqual({ r: 255, g: 255, b: 255 });
    expect(colors[1]).toEqual({ r: 0, g: 0, b: 0 });
  });
  it("accepts a single gradient string background", () =>
    expect(
      getCanvasBackgroundColors(
        { backgroundStyle: "static" },
        "linear-gradient(135deg,#00b140,#008f37)",
      ),
    ).toHaveLength(2));
  it("merges a background with a transition path", () => {
    const colors = getCanvasBackgroundColors(
      { backgroundStyle: "transition", gradientPath: ["#123456"] },
      "linear-gradient(#ffffff,#000000)",
    );
    expect(colors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("pickBestColor", () => {
  const green = getCanvasBackgroundColors(
    { backgroundStyle: "static" },
    "linear-gradient(135deg,#00b140,#008f37)",
  );

  it("falls back to white when there are no candidates", () =>
    expect(pickBestColor([], [])).toBe("#ffffff"));
  it("returns the single candidate when only one is given", () =>
    expect(pickBestColor(["#123456"], [])).toBe("#123456"));
  it("falls back to the first candidate when none can be parsed", () =>
    expect(pickBestColor(["notacolor"], [])).toBe("notacolor"));
  it("drops unparseable candidates from ranking", () =>
    expect(pickBestColor(["notacolor", "#ffffff"], [])).toBe("#ffffff"));
  it("avoids a yellow candidate on a green backdrop", () =>
    expect(pickBestColor(["#ffd60a", "#ff006e"], green, { avoidYellowOnGreen: true })).toBe(
      "#ff006e",
    ));
  it("prefers a high-contrast dark over white on a bright green backdrop", () =>
    expect(pickBestColor(["#111111", "#ffffff"], green)).toBe("#111111"));
  it("returns a candidate from an empty backdrop without crashing", () => {
    const result = pickBestColor(["#ff006e", "#8338ec"], []);
    expect(["#ff006e", "#8338ec"]).toContain(result);
  });
  it("is deterministic for the same inputs", () =>
    expect(pickBestColor(["#ff006e", "#ffffff", "#111111"], green)).toBe(
      pickBestColor(["#ff006e", "#ffffff", "#111111"], green),
    ));
});
