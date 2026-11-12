/**
 * The rule: a vocabulary scene is skipped only by a reader's tap or swipe, never by a timer,
 * an animation end or an effect. A timer may only play a scene out for its own duration.
 *
 * This is a ratchet over VocabularyCard's source. Each place that moves the feed on or
 * changes the page must sit inside one of the places allowed to do it; a new one is a new way
 * to skip a scene, and fails here until it is reviewed against the rule (AGENTS.md).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CARD = fileURLToPath(new URL("../../components/VocabularyCard.tsx", import.meta.url));
const source = readFileSync(CARD, "utf8");

/** For each occurrence of `needle`, the closest enclosing anchor that opens a callback or effect. */
function anchorsOf(needle: string): string[] {
  const anchors: [string, string][] = [
    ["useEffect", "useEffect("],
    ["useLayoutEffect", "useLayoutEffect("],
    ["onFinish", "onFinish: () => {"],
    ["handlePointerEnd", "const handlePointerEnd = useCallback("],
    ["handlePointerStart", "const handlePointerStart = useCallback("],
    ["handlePointerMove", "const handlePointerMove = useCallback("],
    ["advanceWithExit", "const advanceWithExit = useCallback("],
    ["jsx", "onClick="],
  ];
  const found: string[] = [];
  let at = source.indexOf(needle);
  while (at !== -1) {
    let best = { name: "top-level", index: -1 };
    for (const [name, anchor] of anchors) {
      const index = source.lastIndexOf(anchor, at);
      if (index > best.index) best = { name, index };
    }
    found.push(best.name);
    at = source.indexOf(needle, at + needle.length);
  }
  return found;
}

describe("scene skip rule", () => {
  it("advances a word from exactly three places: the answer's own clock, and a coda tap or swipe", () => {
    expect(anchorsOf("advanceWithExit()")).toEqual([
      "onFinish",
      "handlePointerEnd",
      "handlePointerEnd",
    ]);
  });

  it("moves a clue page by hand only from a tap or swipe", () => {
    const pages = [...anchorsOf("playback.next()"), ...anchorsOf("playback.previous()")];
    expect(pages.length).toBeGreaterThan(0);
    expect(new Set(pages)).toEqual(new Set(["handlePointerEnd"]));
  });

  it("does not keep the overlay-close path that advanced a word on its own", () => {
    expect(source).not.toContain("exitDropped");
  });

  it("never ends a word from an effect", () => {
    expect(anchorsOf("advanceWithExit()")).not.toContain("useEffect");
    expect(anchorsOf("advanceWithExit()")).not.toContain("useLayoutEffect");
  });
});
