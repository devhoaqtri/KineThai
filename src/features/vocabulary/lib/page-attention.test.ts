import { describe, expect, it } from "vitest";
import { createPageAttention } from "./page-attention";

/** A window and document made of plain EventTargets, with the facts the signal reads. */
function setup(touch = true) {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    hidden: false,
    activeElement: { tagName: "BODY" } as { tagName: string } | null,
  });
  const flips: [boolean, string | null][] = [];
  const attention = createPageAttention(
    { window: win, document: doc, touchOnly: () => touch, defer: (run) => run() },
    (attended, reason) => flips.push([attended, reason]),
  );
  let notified = 0;
  attention.subscribe(() => (notified += 1));
  const fire = (target: EventTarget, type: string) => target.dispatchEvent(new Event(type));
  const setHidden = (hidden: boolean) => {
    doc.hidden = hidden;
    fire(doc, "visibilitychange");
  };
  return { attention, win, doc, fire, setHidden, flips, notified: () => notified };
}

describe("page attention", () => {
  it("starts attended", () => {
    expect(setup().attention.attended()).toBe(true);
  });

  it("pauses while the page is hidden and resumes when it is back", () => {
    const { attention, setHidden, flips } = setup();
    setHidden(true);
    expect(attention.reason()).toBe("hidden");
    setHidden(false);
    expect(attention.attended()).toBe(true);
    expect(flips).toEqual([
      [false, "hidden"],
      [true, null],
    ]);
  });

  it("pauses on a phone when the system takes the window's focus", () => {
    const { attention, win, fire } = setup(true);
    fire(win, "blur");
    expect(attention.reason()).toBe("unfocused");
    fire(win, "focus");
    expect(attention.attended()).toBe(true);
  });

  it("never pauses a desktop window that merely lost focus", () => {
    const { attention, win, fire, flips } = setup(false);
    fire(win, "blur");
    expect(attention.attended()).toBe(true);
    expect(flips).toEqual([]);
  });

  it("keeps focus that moved into one of the page's own frames", () => {
    const { attention, win, doc, fire } = setup(true);
    doc.activeElement = { tagName: "IFRAME" };
    fire(win, "blur");
    expect(attention.attended()).toBe(true);
  });

  it("lets a touch on the page end a blur the browser never answered with focus", () => {
    const { attention, win, doc, fire } = setup(true);
    fire(win, "blur");
    fire(doc, "pointerdown");
    expect(attention.attended()).toBe(true);
  });

  it("clears a blur when the page comes back into view", () => {
    const { attention, win, fire, setHidden } = setup(true);
    fire(win, "blur");
    setHidden(true);
    setHidden(false);
    expect(attention.attended()).toBe(true);
  });

  it("pauses a frozen or cached page until it resumes", () => {
    const { attention, win, doc, fire } = setup();
    fire(doc, "freeze");
    expect(attention.reason()).toBe("frozen");
    fire(doc, "resume");
    expect(attention.attended()).toBe(true);
    fire(win, "pagehide");
    expect(attention.attended()).toBe(false);
    fire(win, "pageshow");
    expect(attention.attended()).toBe(true);
  });

  it("pauses on a phone when the system takes the music, until it plays or the reader is back", () => {
    const { attention, doc, fire } = setup(true);
    attention.audioInterrupted(true);
    expect(attention.reason()).toBe("interrupted");
    attention.audioInterrupted(false);
    expect(attention.attended()).toBe(true);
    attention.audioInterrupted(true);
    fire(doc, "pointerdown");
    expect(attention.attended()).toBe(true);
  });

  it("never takes a desktop media-key pause for an interruption", () => {
    const { attention } = setup(false);
    attention.audioInterrupted(true);
    expect(attention.attended()).toBe(true);
  });

  it("clears an audio interruption when focus or visibility returns", () => {
    const { attention, win, fire, setHidden } = setup(true);
    attention.audioInterrupted(true);
    fire(win, "focus");
    expect(attention.attended()).toBe(true);
    attention.audioInterrupted(true);
    setHidden(true);
    setHidden(false);
    expect(attention.attended()).toBe(true);
  });

  it("tells listeners on every event, so a missed flip gets re-read", () => {
    const { win, fire, notified } = setup(true);
    fire(win, "focus");
    fire(win, "focus");
    expect(notified()).toBe(2);
  });
});
