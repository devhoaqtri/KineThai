import { describe, expect, it } from "vitest";
import {
  BADGE_ROTATION,
  BADGE_VARIANTS,
  DEMO_BADGE_VARIANT,
  pickBadgeVariant,
} from "../badge-variants";

describe("badge rotation", () => {
  it("rotates through the four chosen looks, all of them real looks", () => {
    expect(BADGE_ROTATION).toEqual(["aurora", "glass", "mint", "sunrise"]);
    for (const look of BADGE_ROTATION) expect(BADGE_VARIANTS).toContain(look);
    expect(DEMO_BADGE_VARIANT).toBe(BADGE_ROTATION[0]);
  });

  it("never gives two neighbouring words the same look", () => {
    for (let position = 0; position < 40; position += 1) {
      expect(pickBadgeVariant(position)).not.toBe(pickBadgeVariant(position + 1));
    }
  });

  it("uses every look in turn, and the same place always gets the same look", () => {
    expect([0, 1, 2, 3].map(pickBadgeVariant)).toEqual([...BADGE_ROTATION]);
    expect(pickBadgeVariant(5)).toBe(pickBadgeVariant(5));
    expect(pickBadgeVariant(4)).toBe(BADGE_ROTATION[0]);
  });

  it("treats a missing or odd position as the first", () => {
    expect(pickBadgeVariant(-1)).toBe(BADGE_ROTATION[0]);
    expect(pickBadgeVariant(1.7)).toBe(BADGE_ROTATION[1]);
  });
});
