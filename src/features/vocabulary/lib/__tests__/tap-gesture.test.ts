import { describe, expect, it } from "vitest";
import { createTapGesture, EMULATED_MOUSE_WINDOW_MS } from "../tap-gesture";

/**
 * The events a touch screen sends for one tap: the touch pair, then the compatibility mouse
 * events at the same spot a moment after the finger lifts. A card that read every one of
 * them as a tap moved on twice for one touch.
 */
function tapOnTouchScreen(gesture: ReturnType<typeof createTapGesture>, x: number, t: number) {
  const taps = [];
  gesture.begin("touch", x, 10, t);
  taps.push(gesture.end("touch", x, 10, t + 80));
  gesture.begin("mouse", x, 10, t + 200);
  taps.push(gesture.end("mouse", x, 10, t + 210));
  return taps.filter((tap) => tap !== null);
}

describe("tap gesture", () => {
  it("counts one touch as one tap, not its emulated mouse events as a second", () => {
    const gesture = createTapGesture();
    const taps = tapOnTouchScreen(gesture, 300, 1_000);
    expect(taps).toHaveLength(1);
    expect(taps[0]?.start).toEqual({ x: 300, y: 10, t: 1_000 });
  });

  it("counts each of several separate touches once", () => {
    const gesture = createTapGesture();
    let count = 0;
    for (let index = 0; index < 4; index += 1) {
      count += tapOnTouchScreen(gesture, 300, 1_000 + index * 5_000).length;
    }
    expect(count).toBe(4);
  });

  it("counts a real mouse click, with no touch just before it", () => {
    const gesture = createTapGesture();
    gesture.begin("mouse", 40, 20, 5_000);
    expect(gesture.end("mouse", 40, 20, 5_060)).not.toBeNull();
  });

  it("counts a mouse click once the touch window has passed", () => {
    const gesture = createTapGesture();
    gesture.begin("touch", 40, 20, 1_000);
    gesture.end("touch", 40, 20, 1_050);
    const later = 1_050 + EMULATED_MOUSE_WINDOW_MS + 1;
    gesture.begin("mouse", 40, 20, later);
    expect(gesture.end("mouse", 40, 20, later + 60)).not.toBeNull();
  });

  it("ignores a mouse up with no gesture to complete", () => {
    const gesture = createTapGesture();
    expect(gesture.end("mouse", 0, 0, 100)).toBeNull();
    expect(gesture.end("touch", 0, 0, 200)).toBeNull();
  });

  it("drops the gesture in progress when cancelled", () => {
    const gesture = createTapGesture();
    gesture.begin("touch", 10, 10, 0);
    expect(gesture.current()).not.toBeNull();
    gesture.cancel();
    expect(gesture.current()).toBeNull();
    expect(gesture.end("touch", 10, 10, 50)).toBeNull();
  });

  it("keeps where a drag began until it ends", () => {
    const gesture = createTapGesture();
    gesture.begin("touch", 100, 200, 0);
    expect(gesture.current()).toEqual({ x: 100, y: 200, t: 0 });
    const ended = gesture.end("touch", 180, 205, 300);
    expect(ended?.start).toEqual({ x: 100, y: 200, t: 0 });
    expect(ended?.x).toBe(180);
    expect(gesture.current()).toBeNull();
  });
});
