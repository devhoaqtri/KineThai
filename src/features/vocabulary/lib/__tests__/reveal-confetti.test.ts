import { describe, expect, it } from "vitest";
import {
  CONFETTI_INFO,
  CONFETTI_VARIANTS,
  FESTIVE_PALETTE,
  spawnConfetti,
  stepConfetti,
  type ConfettiScene,
} from "../reveal-confetti";

const scene: ConfettiScene = {
  width: 400,
  height: 800,
  originX: 200,
  originY: 272,
  palette: FESTIVE_PALETTE,
  seed: "s",
};

describe("reveal confetti", () => {
  it("names every variant", () => {
    for (const variant of CONFETTI_VARIANTS) expect(CONFETTI_INFO[variant].label).toBeTruthy();
  });

  it("throws the same burst for the same seed", () => {
    for (const variant of CONFETTI_VARIANTS) {
      expect(spawnConfetti(variant, scene)).toEqual(spawnConfetti(variant, scene));
    }
  });

  it("puts pieces on the card, then clears it", () => {
    for (const variant of CONFETTI_VARIANTS) {
      let field = spawnConfetti(variant, scene);
      let peak = 0;
      for (let t = 0; t < 12 && field.length; t += 1 / 60) {
        field = stepConfetti(field, 1 / 60, scene);
        const onCard = field.filter(
          (p) => p.age >= 0 && p.x >= 0 && p.x <= scene.width && p.y >= 0 && p.y <= scene.height,
        ).length;
        peak = Math.max(peak, onCard);
      }
      expect(peak, variant).toBeGreaterThan(10);
      expect(field, variant).toHaveLength(0);
    }
  });

  it("bursts each firework shell into sparks", () => {
    let field = spawnConfetti("fireworks", scene);
    let sparks = 0;
    for (let t = 0; t < 3; t += 1 / 60) {
      field = stepConfetti(field, 1 / 60, scene);
      sparks = Math.max(sparks, field.filter((p) => p.shape === "spark").length);
    }
    expect(sparks).toBeGreaterThanOrEqual(46);
  });
});
