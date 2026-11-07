/**
 * The reveal celebration as a small family of designs, each one a row of parameters.
 *
 * Every design is the same five layers, recombined: a soft BLOOM of light behind the word,
 * a CORE pinpoint that swells just before the release (the anticipation), expanding RINGS
 * that start at the word's own outline, light RAYS, and one or more particle EMITTERS with
 * real physics (launch cone, speed, air drag, gravity, spin, flutter, twinkle). The
 * choreography is shared: a short inhale on the core, the release, the follow-through as
 * drag bleeds the speed off, and a graceful settle where everything fades before it stops.
 * lib/burst-engine turns a row into a scene and draws it on a canvas; components/RevealBurst
 * owns the canvas and the clock.
 *
 * Lengths are in "design px" on a 390px-wide card and scale with the card; times are in
 * seconds. Colours are never in the table: a particle names a TINT (the card's accent, its
 * second accent, or a light or hot variant of them) and the engine resolves it against the
 * card's palette and tone, so every design re-skins itself on every card.
 *
 * Exports: BURST_VARIANTS, BurstVariant, DEFAULT_BURST_VARIANT, BURST_ROTATION,
 *   pickBurstVariant, BURST_INFO, BurstConfig,
 *   BurstEmitter, ParticleShape, BurstTint, BURST_CONFIG, CALM_BURST, MAX_BURST_PARTICLES
 * Depends on: nothing (pure data)
 */

export const BURST_VARIANTS = [
  "classic",
  "confetti",
  "stardust",
  "shockwave",
  "fireworks",
  "halo",
] as const;
export type BurstVariant = (typeof BURST_VARIANTS)[number];

/** The design a burst throws when nothing picks one (the lab's first, and the fallback). */
export const DEFAULT_BURST_VARIANT: BurstVariant = "classic";

/**
 * The designs the feed takes turns with. Each word always gets the same one (it is picked
 * from the word's id), so a replay or a revisit looks the same while the stream varies.
 */
export const BURST_ROTATION: readonly BurstVariant[] = ["classic", "stardust", "halo"];

/**
 * The rotation's design for one word.
 * @pure true
 */
export function pickBurstVariant(wordId: string): BurstVariant {
  let h = 2166136261;
  for (let i = 0; i < wordId.length; i += 1) {
    h ^= wordId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return BURST_ROTATION[(h >>> 0) % BURST_ROTATION.length] ?? DEFAULT_BURST_VARIANT;
}

/** How each design is named and described where one is picked. */
export const BURST_INFO: Record<BurstVariant, { label: string; blurb: string }> = {
  classic: {
    label: "Bừng sáng",
    blurb: "Lấy đà một nhịp, rồi tia sáng và ánh sao bung ra quanh chữ, chậm dần và tắt êm.",
  },
  confetti: {
    label: "Hoa giấy",
    blurb: "Giấy màu bắn vọt lên, lật mặt lấp lánh, rồi chao lượn rơi xuống như thật.",
  },
  stardust: {
    label: "Bụi sao",
    blurb: "Quầng sáng mềm và những ngôi sao nhỏ nở ra, nhấp nháy, trôi nhẹ lên rồi tan.",
  },
  shockwave: {
    label: "Sóng xung kích",
    blurb: "Hai vòng sóng mảnh nở từ viền chữ, kéo theo bụi sáng dừng đúng ở mép sóng.",
  },
  fireworks: {
    label: "Pháo hoa",
    blurb: "Những vệt sáng có đuôi vút ra, rủ xuống theo trọng lực, lóe sao ở cuối đường bay.",
  },
  halo: {
    label: "Hào quang",
    blurb: "Tia sáng dịu xoay chậm sau chữ, vài đốm sáng bay lên. Trang nhã, không ồn ào.",
  },
};

/**
 * A streak is a comet with a tapered tail along its own path; a glint is a four-point
 * sparkle that pops and twinkles; confetti is a paper chip that flips in 3D and flutters;
 * a dot is a round mote.
 */
export type ParticleShape = "streak" | "glint" | "confetti" | "dot";

/** Colour roles, resolved against the card (see BurstPalette in lib/burst-engine). */
export type BurstTint = "accent" | "alt" | "light" | "hot";

export type BurstEmitter = {
  shape: ParticleShape;
  count: number;
  /** Launch direction, degrees (0 = right, -90 = up), and the cone's full width. */
  aim: number;
  spread: number;
  /** Launch speed range, design px/s. */
  speed: [number, number];
  /** Air drag, 1/s: speed decays as e^(-drag·t). */
  drag: number;
  /** Design px/s², positive pulls down; negative floats up. */
  gravity: number;
  /** Size range, design px (streak width, glint radius, confetti length, dot radius). */
  size: [number, number];
  /** How long each particle lives, s. */
  life: [number, number];
  /** Launch lag after the release, s. */
  delay: [number, number];
  /** Extra spawn distance beyond the word's outline, design px. */
  offset?: [number, number];
  /** Max spin, rad/s. */
  spin?: number;
  /** Side-to-side flutter amplitude once the throw has slowed, design px. */
  sway?: number;
  /** 0–1: how deeply the particle blinks. */
  twinkle?: number;
  /** Tail length of a streak, in seconds of its own path. */
  trail?: number;
  /** Tints drawn from, weighted by repetition. */
  tints: BurstTint[];
};

export type BurstConfig = {
  /** The inhale before the release, s. */
  anticipation: number;
  /** Peak radius of the core pinpoint, design px (0 = none). */
  core: number;
  /** Soft light behind the word. `size` multiplies the word's outline. */
  bloom: { size: number; peak: number; rise: number; decay: number } | null;
  /** Thin expanding outlines. `grow` is how far they travel past the word, design px. */
  rings: { count: number; grow: number; width: number; stagger: number; dur: number } | null;
  /** Soft spokes of light that turn slowly behind the word. */
  rays: { count: number; length: number; peak: number; spin: number; dur: number } | null;
  emitters: BurstEmitter[];
};

/** Every design stays under this many particles, so a mid-range phone holds 60 fps. */
export const MAX_BURST_PARTICLES = 96;

export const BURST_CONFIG: Record<BurstVariant, BurstConfig> = {
  classic: {
    anticipation: 0.09,
    core: 16,
    bloom: { size: 1.45, peak: 0.5, rise: 0.09, decay: 0.6 },
    rings: { count: 1, grow: 118, width: 2.6, stagger: 0, dur: 0.62 },
    rays: null,
    emitters: [
      {
        shape: "streak",
        count: 24,
        aim: 0,
        spread: 360,
        speed: [820, 1500],
        drag: 5.2,
        gravity: 220,
        size: [2.6, 4.2],
        life: [0.5, 0.78],
        delay: [0, 0.04],
        trail: 0.06,
        tints: ["accent", "accent", "alt", "light"],
      },
      {
        shape: "glint",
        count: 12,
        aim: 0,
        spread: 360,
        speed: [180, 460],
        drag: 3.4,
        gravity: 30,
        size: [4.5, 8.5],
        life: [0.7, 1.1],
        delay: [0.04, 0.2],
        offset: [6, 28],
        spin: 2,
        twinkle: 0.55,
        tints: ["light", "hot", "alt"],
      },
    ],
  },
  confetti: {
    anticipation: 0.07,
    core: 12,
    bloom: { size: 1.2, peak: 0.34, rise: 0.08, decay: 0.45 },
    rings: null,
    rays: null,
    emitters: [
      {
        shape: "confetti",
        count: 52,
        aim: -90,
        spread: 168,
        speed: [520, 1020],
        drag: 3,
        gravity: 700,
        size: [8, 13],
        life: [1.5, 2.2],
        delay: [0, 0.06],
        spin: 9,
        sway: 16,
        tints: ["accent", "accent", "alt", "alt", "light", "hot"],
      },
      {
        shape: "glint",
        count: 8,
        aim: -90,
        spread: 200,
        speed: [160, 380],
        drag: 3,
        gravity: 40,
        size: [4, 7],
        life: [0.6, 0.95],
        delay: [0.02, 0.14],
        spin: 2,
        twinkle: 0.6,
        tints: ["hot", "light"],
      },
    ],
  },
  stardust: {
    anticipation: 0.1,
    core: 14,
    bloom: { size: 1.75, peak: 0.42, rise: 0.16, decay: 0.95 },
    rings: null,
    rays: null,
    emitters: [
      {
        shape: "glint",
        count: 18,
        aim: 0,
        spread: 360,
        speed: [110, 360],
        drag: 2.3,
        gravity: -26,
        size: [5, 12],
        life: [1, 1.55],
        delay: [0, 0.32],
        offset: [4, 22],
        spin: 1.4,
        twinkle: 0.75,
        tints: ["hot", "light", "light", "accent", "alt"],
      },
      {
        shape: "dot",
        count: 30,
        aim: 0,
        spread: 360,
        speed: [70, 280],
        drag: 1.9,
        gravity: -34,
        size: [1, 2.2],
        life: [0.9, 1.5],
        delay: [0.02, 0.3],
        offset: [0, 30],
        twinkle: 0.5,
        tints: ["light", "hot", "accent"],
      },
    ],
  },
  shockwave: {
    anticipation: 0.12,
    core: 22,
    bloom: { size: 1.4, peak: 0.62, rise: 0.06, decay: 0.48 },
    rings: { count: 2, grow: 200, width: 4.2, stagger: 0.08, dur: 0.74 },
    rays: null,
    emitters: [
      {
        // Dust carried on the wave front: launched fast, stopped by drag right about where
        // the first ring is when it fades (speed / drag ≈ the ring's reach).
        shape: "dot",
        count: 46,
        aim: 0,
        spread: 360,
        speed: [900, 1300],
        drag: 6.2,
        gravity: 0,
        size: [1.5, 3],
        life: [0.48, 0.74],
        delay: [0, 0.03],
        tints: ["light", "hot", "accent", "alt"],
      },
      {
        shape: "streak",
        count: 14,
        aim: 0,
        spread: 360,
        speed: [1300, 1750],
        drag: 6.8,
        gravity: 0,
        size: [2.4, 3.6],
        life: [0.32, 0.46],
        delay: [0, 0.02],
        trail: 0.05,
        tints: ["hot", "light"],
      },
    ],
  },
  fireworks: {
    anticipation: 0.08,
    core: 18,
    bloom: { size: 1.1, peak: 0.3, rise: 0.07, decay: 0.5 },
    rings: null,
    rays: null,
    emitters: [
      {
        shape: "streak",
        count: 30,
        aim: 0,
        spread: 360,
        speed: [560, 960],
        drag: 2.1,
        gravity: 430,
        size: [2.2, 3.4],
        life: [0.9, 1.25],
        delay: [0, 0.05],
        trail: 0.13,
        tints: ["accent", "accent", "alt", "light"],
      },
      {
        // The crackle: late sparkles out where the trails droop and die.
        shape: "glint",
        count: 18,
        aim: 0,
        spread: 360,
        speed: [20, 80],
        drag: 2,
        gravity: 120,
        size: [4.5, 8],
        life: [0.38, 0.6],
        delay: [0.5, 0.82],
        offset: [150, 235],
        spin: 3,
        twinkle: 0.85,
        tints: ["hot", "light", "alt"],
      },
    ],
  },
  halo: {
    anticipation: 0.12,
    core: 12,
    bloom: { size: 2, peak: 0.42, rise: 0.26, decay: 1.15 },
    rings: null,
    rays: { count: 14, length: 280, peak: 0.36, spin: 16, dur: 1.65 },
    emitters: [
      {
        shape: "dot",
        count: 16,
        aim: -90,
        spread: 90,
        speed: [40, 120],
        drag: 0.7,
        gravity: -24,
        size: [1.6, 3.2],
        life: [1.2, 1.8],
        delay: [0.06, 0.45],
        offset: [0, 26],
        sway: 6,
        twinkle: 0.5,
        tints: ["light", "hot", "accent"],
      },
      {
        shape: "glint",
        count: 6,
        aim: 0,
        spread: 360,
        speed: [30, 90],
        drag: 1.6,
        gravity: -10,
        size: [5, 8],
        life: [1, 1.4],
        delay: [0.12, 0.4],
        offset: [18, 46],
        spin: 1,
        twinkle: 0.7,
        tints: ["hot", "light"],
      },
    ],
  },
};

/**
 * The reduced-motion alternative for every design: light that comes up behind the word and
 * a few sparkles that fade in and out where they stand. Nothing travels, spins or scales;
 * only opacity changes. The engine places the sparkles and holds them still.
 */
export const CALM_BURST: BurstConfig = {
  anticipation: 0,
  core: 0,
  bloom: { size: 1.5, peak: 0.42, rise: 0.32, decay: 1 },
  rings: null,
  rays: null,
  emitters: [
    {
      shape: "glint",
      count: 7,
      aim: 0,
      spread: 360,
      speed: [0, 0],
      drag: 0,
      gravity: 0,
      size: [4.5, 7.5],
      life: [0.9, 1.2],
      delay: [0.05, 0.35],
      offset: [16, 40],
      twinkle: 0,
      tints: ["hot", "light", "alt"],
    },
  ],
};
