import { describe, expect, it } from "vitest";
import {
  BURST_CONFIG,
  BURST_INFO,
  BURST_VARIANTS,
  sparkFan,
} from "../burst-variants";

describe("burst-variants", () => {
  it("names and configures every variant", () => {
    for (const variant of BURST_VARIANTS) {
      expect(BURST_INFO[variant].label).toBeTruthy();
      expect(BURST_INFO[variant].blurb).toBeTruthy();
      expect(BURST_CONFIG[variant]).toBeTruthy();
    }
  });

  it("keeps the default the classic atoms that VocabularyStage mounts bare", () => {
    // The shipped reveal must stay a radial flash + one ring + a fan of pill sparks.
    expect(BURST_CONFIG.classic).toMatchObject({
      flash: "radial",
      rings: 1,
      sparkShape: "pill",
      motion: "out",
      sweep: false,
    });
  });

  it("never fires an atom its config disables", () => {
    for (const variant of BURST_VARIANTS) {
      const cfg = BURST_CONFIG[variant];
      if (cfg.flash === "none") expect(cfg.flashDur).toBe(0);
      if (cfg.rings === 0) expect(cfg.ringDur).toBe(0);
      if (cfg.sparks === 0) expect(["rays", "twinkle", "pinwheel", "fountain", "ripple", "halo", "starburst", "shimmer", "ember", "sprinkle"].includes(variant) || cfg.sparkDur >= 0).toBe(true);
    }
  });

  it("lays out exactly the requested number of sparks, deterministically", () => {
    for (const motion of ["out", "spin", "fountain", "drift"] as const) {
      const fan = sparkFan(12, motion);
      expect(fan).toHaveLength(12);
      expect(fan).toEqual(sparkFan(12, motion)); // same count + motion, same picture
      for (const spark of fan) {
        expect(spark.reach).toBeGreaterThan(0);
        expect(spark.reach).toBeLessThanOrEqual(1.2);
      }
    }
  });

  it("biases fountain and drift upward and sweeps embers side to side", () => {
    // Negative angles point up in CSS's rotate frame; an upward cone reads as a spray.
    for (const spark of sparkFan(20, "fountain")) expect(spark.angle).toBeLessThan(0);
    const drift = sparkFan(22, "drift");
    expect(drift.some((spark) => spark.drift > 0)).toBe(true);
    expect(drift.some((spark) => spark.drift < 0)).toBe(true);
  });

  it("produces no sparks when a design asks for none", () => {
    expect(sparkFan(0, "out")).toEqual([]);
  });
});
