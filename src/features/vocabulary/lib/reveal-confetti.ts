/**
 * Confetti for the moment a word is revealed: seven candidate looks, each a seeded burst
 * of particles run through one small physics step.
 *
 * Pure on purpose. `spawnConfetti` turns a variant, the card's size and the word's centre
 * into particles, and `stepConfetti` advances them by a time step, so the renderer
 * (components/RevealConfetti) only draws, and a paused card simply stops calling the step:
 * nothing here owns a clock. The same seed always gives the same burst.
 *
 * Every distance is a share of the card, not a pixel count, so a 280 px preview frame and
 * a full phone card throw the same picture.
 *
 * Exports: CONFETTI_VARIANTS, ConfettiVariant, CONFETTI_INFO, FESTIVE_PALETTE,
 *   FOIL_PALETTE, ConfettiShape, ConfettiParticle, ConfettiScene, spawnConfetti,
 *   stepConfetti, particleAlpha
 * Depends on: ./random
 */

import { randomGenerator } from "./random";

export const CONFETTI_VARIANTS = [
  "cannons",
  "pop",
  "rain",
  "sparkle",
  "streamers",
  "fireworks",
  "foil",
] as const;
export type ConfettiVariant = (typeof CONFETTI_VARIANTS)[number];

/** How each variant is named and described where one is picked. */
export const CONFETTI_INFO: Record<ConfettiVariant, { label: string; blurb: string }> = {
  cannons: { label: "Pháo giấy hai bên", blurb: "Hai ống pháo ở góc dưới bắn chéo về phía từ." },
  pop: { label: "Nổ bung", blurb: "Giấy màu bung tròn ngay từ chữ rồi rơi xuống." },
  rain: { label: "Mưa giấy", blurb: "Giấy màu lả tả rơi từ trên xuống, nhẹ nhàng." },
  sparkle: { label: "Lấp lánh", blurb: "Sao nhỏ nhấp nháy quanh chữ rồi bay lên, rất tinh tế." },
  streamers: { label: "Dây kim tuyến", blurb: "Dải ruy băng xoắn phóng lên từ đáy thẻ." },
  fireworks: { label: "Pháo hoa", blurb: "Ba quả pháo hoa nổ phía trên chữ." },
  foil: { label: "Giấy kim loại", blurb: "Mảnh vàng bạc lấp loáng khi lật, rơi chậm." },
};

/** Party colours, for any card. */
export const FESTIVE_PALETTE = [
  "#ff5d8f",
  "#ffd23d",
  "#4dabff",
  "#3ddc97",
  "#b47cff",
  "#ff9d52",
] as const;

/** Gold and silver foil: [base, highlight] pairs, flattened. */
export const FOIL_PALETTE = ["#c9952b", "#f2c94c", "#a8b0bd", "#e9edf2", "#d4a373"] as const;

export type ConfettiShape = "strip" | "square" | "circle" | "star" | "ribbon" | "spark" | "shell";

/** One piece in flight. Mutable: the step updates it in place to keep frames cheap. */
export type ConfettiParticle = {
  shape: ConfettiShape;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Edge length in px. */
  size: number;
  /** Rotation in the card's plane, radians, and its speed. */
  rot: number;
  spin: number;
  /** Phase of the paper turning over (cos of it is the visible face width). */
  flip: number;
  flipSpeed: number;
  /** Side-to-side flutter, px/s, and how fast it swings. */
  sway: number;
  swayFreq: number;
  phase: number;
  /** px/s² downwards, and air resistance per second (velocity decays by e^-drag·t). */
  gravity: number;
  drag: number;
  /** Seconds since launch; negative while still waiting to launch. */
  age: number;
  /** Seconds it lives once launched. */
  life: number;
  fadeOut: number;
  glow: boolean;
  /** Metallic: a bright glint when the face turns towards the light. */
  shimmer: boolean;
  /** Recent positions, flat [x, y, x, y, …], for ribbons and spark trails. */
  trail: number[] | null;
  trailLength: number;
  /** A firework shell: bursts into this many sparks at the top of its climb. */
  burst: number;
};

/** The card the burst is thrown across. */
export type ConfettiScene = {
  width: number;
  height: number;
  /** The revealed word's centre, card-local px. */
  originX: number;
  originY: number;
  /** Colours to draw from; the foil variant brings its own. */
  palette: readonly string[];
  /** Same seed, same burst. */
  seed: string;
};

type Rand = () => number;

const between = (rand: Rand, low: number, high: number) => low + rand() * (high - low);
const pick = <T>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;

function particle(rand: Rand, init: Partial<ConfettiParticle> & { x: number; y: number }) {
  return {
    shape: "strip",
    color: "#fff",
    vx: 0,
    vy: 0,
    size: 8,
    rot: rand() * Math.PI * 2,
    spin: between(rand, -6, 6),
    flip: rand() * Math.PI * 2,
    flipSpeed: between(rand, 5, 12),
    sway: 0,
    swayFreq: 0,
    phase: rand() * Math.PI * 2,
    gravity: 0,
    drag: 0,
    age: 0,
    life: 4,
    fadeOut: 0.6,
    glow: false,
    shimmer: false,
    trail: null,
    trailLength: 0,
    burst: 0,
    ...init,
  } satisfies ConfettiParticle;
}

const PAPER: readonly ConfettiShape[] = ["strip", "strip", "square", "circle"];

/**
 * @param variant Which look to throw
 * @param scene The card's size, the word's centre, colours and seed
 * @returns Every particle of the burst, each waiting out its own launch delay
 * @pure true
 */
export function spawnConfetti(variant: ConfettiVariant, scene: ConfettiScene): ConfettiParticle[] {
  const rand = randomGenerator(`${variant}:${scene.seed}`);
  const { width: W, height: H, originX: ox, originY: oy } = scene;
  const palette = scene.palette.length ? scene.palette : FESTIVE_PALETTE;
  // Piece size follows the card's width, so a small preview is not buried in paper.
  const unit = Math.max(0.55, Math.min(1.4, W / 400));
  const paperSize = () => between(rand, 7, 12) * unit;
  // Paper falls at gravity / drag at most; this pair settles near a fifth of a card a second.
  const g = H * 1.1;
  const out: ConfettiParticle[] = [];

  if (variant === "cannons") {
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -6 : W + 6;
      const y0 = H * 0.94;
      const aim = Math.atan2(oy - H * 0.16 - y0, ox - x0);
      for (let i = 0; i < 70; i++) {
        const drag = between(rand, 2.2, 3.2);
        const angle = aim + between(rand, -0.3, 0.3);
        // Travel before air stops it is speed / drag: aimed to land the cloud around the word.
        const reach = Math.hypot(ox - x0, oy - y0) * between(rand, 0.85, 1.5);
        const speed = reach * drag;
        out.push(
          particle(rand, {
            shape: pick(rand, PAPER),
            color: pick(rand, palette),
            x: x0,
            y: y0,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: paperSize(),
            gravity: g,
            drag,
            sway: between(rand, 10, 30) * unit,
            swayFreq: between(rand, 2, 5),
            age: -between(rand, 0, 0.14),
            life: between(rand, 3.4, 4.6),
          }),
        );
      }
    }
  } else if (variant === "pop" || variant === "foil") {
    const foil = variant === "foil";
    const count = foil ? 64 : 110;
    const span = Math.min(W, H);
    for (let i = 0; i < count; i++) {
      const drag = foil ? between(rand, 2.6, 3.4) : between(rand, 2.4, 3.4);
      const angle = rand() * Math.PI * 2;
      // sqrt keeps the burst filled to its middle instead of a hollow ring.
      const reach = span * (foil ? 0.42 : 0.5) * Math.sqrt(between(rand, 0.08, 1));
      const speed = reach * drag;
      out.push(
        particle(rand, {
          shape: foil ? pick(rand, ["strip", "strip", "square"] as const) : pick(rand, PAPER),
          color: foil ? pick(rand, FOIL_PALETTE) : pick(rand, palette),
          x: ox + between(rand, -0.06, 0.06) * W,
          y: oy,
          vx: Math.cos(angle) * speed,
          // A lift so the cloud rises over the word before it falls.
          vy: Math.sin(angle) * speed - span * 0.55,
          size: paperSize() * (foil ? 1.25 : 1),
          gravity: foil ? g * 0.75 : g,
          drag,
          flipSpeed: foil ? between(rand, 3, 7) : between(rand, 5, 12),
          sway: between(rand, 12, 34) * unit,
          swayFreq: between(rand, 1.5, 4),
          shimmer: foil,
          age: -between(rand, 0, 0.06),
          life: between(rand, foil ? 4.2 : 3.2, foil ? 5.4 : 4.4),
          fadeOut: foil ? 1 : 0.6,
        }),
      );
    }
    if (!foil) {
      for (let i = 0; i < 12; i++) {
        const angle = rand() * Math.PI * 2;
        const speed = span * between(rand, 0.6, 1.1) * 2.4;
        out.push(
          particle(rand, {
            shape: "star",
            color: "#fff6c8",
            x: ox,
            y: oy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: between(rand, 7, 11) * unit,
            drag: 2.4,
            glow: true,
            spin: between(rand, -3, 3),
            life: between(rand, 0.7, 1.1),
            fadeOut: 0.5,
          }),
        );
      }
    }
  } else if (variant === "rain") {
    for (let i = 0; i < 95; i++) {
      const drag = between(rand, 2.4, 3.6);
      out.push(
        particle(rand, {
          shape: pick(rand, PAPER),
          color: pick(rand, palette),
          x: rand() * W,
          y: -12 - rand() * H * 0.1,
          vy: between(rand, 0.1, 0.3) * H,
          size: paperSize(),
          gravity: g * 0.8,
          drag,
          flipSpeed: between(rand, 3, 8),
          sway: between(rand, 30, 70) * unit,
          swayFreq: between(rand, 1.5, 3.5),
          // A curtain, not a slab: launches spread over a second and a half.
          age: -between(rand, 0, 1.5),
          life: 6,
          fadeOut: 0.8,
        }),
      );
    }
  } else if (variant === "sparkle") {
    const rx = W * 0.42;
    const ry = H * 0.12;
    for (let i = 0; i < 48; i++) {
      const angle = rand() * Math.PI * 2;
      const r = Math.sqrt(between(rand, 0.15, 1));
      out.push(
        particle(rand, {
          shape: rand() < 0.7 ? "star" : "spark",
          color: rand() < 0.55 ? "#fff6c8" : pick(rand, palette),
          x: ox + Math.cos(angle) * rx * r,
          y: oy + Math.sin(angle) * ry * r,
          vx: between(rand, -8, 8) * unit,
          vy: -between(rand, 18, 50) * unit,
          size: between(rand, 6, 13) * unit,
          spin: between(rand, -1.5, 1.5),
          // Twinkle speed: the star's scale pulses on this.
          flipSpeed: between(rand, 7, 14),
          glow: true,
          age: -between(rand, 0, 1.4),
          life: between(rand, 1.1, 2),
          fadeOut: 0.7,
        }),
      );
    }
  } else if (variant === "streamers") {
    for (let i = 0; i < 16; i++) {
      const drag = between(rand, 1.4, 1.9);
      const reach = (H - oy) * between(rand, 1.05, 1.6);
      out.push(
        particle(rand, {
          shape: "ribbon",
          color: pick(rand, palette),
          x: ox + between(rand, -0.38, 0.38) * W,
          y: H + 10,
          vx: between(rand, -0.25, 0.25) * W,
          vy: -reach * drag,
          size: between(rand, 5, 8) * unit,
          gravity: g * 0.9,
          drag,
          sway: between(rand, 110, 190) * unit,
          swayFreq: between(rand, 7, 11),
          trail: [],
          trailLength: 22,
          age: -between(rand, 0, 0.25),
          life: between(rand, 3.4, 4.4),
          fadeOut: 0.9,
        }),
      );
    }
    for (let i = 0; i < 40; i++) {
      const drag = between(rand, 2.2, 3);
      out.push(
        particle(rand, {
          shape: pick(rand, ["square", "circle"] as const),
          color: pick(rand, palette),
          x: ox + between(rand, -0.3, 0.3) * W,
          y: H + 10,
          vx: between(rand, -0.3, 0.3) * W,
          vy: -(H - oy) * between(rand, 1, 1.5) * drag,
          size: paperSize() * 0.8,
          gravity: g,
          drag,
          sway: between(rand, 10, 30) * unit,
          swayFreq: between(rand, 2, 4),
          age: -between(rand, 0.05, 0.35),
          life: 4,
        }),
      );
    }
  } else {
    // Fireworks: shells climb from the bottom and burst above the word.
    // Strong enough that a shell reaches the top of its climb in under a second.
    const gravity = H * 2.6;
    const columns = [0.24, 0.52, 0.78];
    columns.forEach((column, i) => {
      const x0 = W * (column + between(rand, -0.05, 0.05));
      const apex = Math.max(H * 0.08, oy - H * between(rand, 0.06, 0.2));
      const climb = H + 8 - apex;
      out.push(
        particle(rand, {
          shape: "shell",
          color: palette[i % palette.length]!,
          x: x0,
          y: H + 8,
          vx: (ox - x0) * 0.08,
          // Launch speed that stops exactly at the apex under this gravity.
          vy: -Math.sqrt(2 * gravity * climb),
          size: 3.2 * unit,
          gravity,
          glow: true,
          trail: [],
          trailLength: 10,
          age: -i * 0.22,
          life: 3,
          burst: 46,
        }),
      );
    });
  }
  return out;
}

/**
 * Advance every particle by `dt` seconds, in place, bursting shells that have stopped
 * climbing and dropping the dead.
 * @param particles The field, mutated
 * @param dt Seconds since the last step; long gaps should be clamped by the caller
 * @param scene The card, for its bounds and burst colours
 * @returns The live field, including sparks born this step
 */
export function stepConfetti(
  particles: ConfettiParticle[],
  dt: number,
  scene: ConfettiScene,
): ConfettiParticle[] {
  const live: ConfettiParticle[] = [];
  for (const p of particles) {
    p.age += dt;
    if (p.age < 0) {
      live.push(p);
      continue;
    }
    const air = Math.exp(-p.drag * dt);
    p.vx *= air;
    p.vy = p.vy * air + p.gravity * dt;
    p.x += p.vx * dt + Math.cos(p.phase + p.age * p.swayFreq) * p.sway * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
    p.flip += p.flipSpeed * dt;
    if (p.trail) {
      p.trail.push(p.x, p.y);
      if (p.trail.length > p.trailLength * 2) p.trail.splice(0, 2);
    }
    if (p.burst && p.vy >= 0) {
      live.push(...sparks(p, scene));
      continue;
    }
    if (p.age < p.life && p.y < scene.height + 60 && p.x > -80 && p.x < scene.width + 80) {
      live.push(p);
    }
  }
  return live;
}

/** A shell's sparks: a ring of its own colour with a few white ones. */
function sparks(shell: ConfettiParticle, scene: ConfettiScene): ConfettiParticle[] {
  const rand = randomGenerator(`burst:${scene.seed}:${shell.x.toFixed(1)}`);
  const radius = Math.min(scene.width, scene.height) * between(rand, 0.26, 0.34);
  const out: ConfettiParticle[] = [];
  for (let i = 0; i < shell.burst; i++) {
    const angle = (i / shell.burst) * Math.PI * 2 + between(rand, -0.06, 0.06);
    const drag = 2.6;
    const speed = radius * drag * between(rand, 0.75, 1.05);
    out.push(
      particle(rand, {
        shape: "spark",
        color: rand() < 0.18 ? "#ffffff" : shell.color,
        x: shell.x,
        y: shell.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: shell.size * between(rand, 0.8, 1.2),
        gravity: scene.height * 0.18,
        drag,
        glow: true,
        trail: [],
        trailLength: 7,
        life: between(rand, 1.1, 1.6),
        fadeOut: 0.7,
      }),
    );
  }
  return out;
}

/** @returns How opaque a particle is now: a quick fade in, then out over its last moments. */
export function particleAlpha(p: ConfettiParticle): number {
  if (p.age < 0) return 0;
  const fadeIn = Math.min(1, p.age / 0.08);
  const left = p.life - p.age;
  const fadeOut = p.fadeOut > 0 ? Math.min(1, Math.max(0, left / p.fadeOut)) : 1;
  return fadeIn * fadeOut;
}
