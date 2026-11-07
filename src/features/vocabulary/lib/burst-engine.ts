/**
 * The reveal burst's engine: turns a design (lib/burst-variants) into a scene of particles
 * and draws any moment of it on a 2D canvas.
 *
 * Motion is CLOSED-FORM, not stepped: a particle thrown with velocity v under air drag k
 * and gravity g sits at v·(1−e^(−kt))/k + (g/k)·(t − (1−e^(−kt))/k) at time t. So a frame
 * is a pure function of time — the lab can scrub, slow down and freeze it exactly, a
 * dropped frame never changes where anything lands, and nothing accumulates error.
 *
 * The word is protected twice. The canvas sits under the text, and every particle fades
 * out as it nears the word's box (keepOut), so nothing ever crosses the letters; the
 * particles are born on that box's outline and only become visible as they leave it.
 *
 * Colours come from the card: resolvePalette maps the design's tints onto the card's two
 * accents for its tone. On a deep card the light is additive (overlapping streaks glow);
 * on a pale card it is drawn as saturated ink, and the bloom brightens the paper behind
 * the dark letters instead of tinting it.
 *
 * Exports: DESIGN_WIDTH, BurstPalette, BurstGeometry, BurstScene, BurstSprites, Rgb,
 *   mulberry32, travel, keepOut, wordGeometry, buildScene, particleAt, resolvePalette,
 *   parseColor, buildSprites, drawBurst
 * Depends on: ./burst-variants
 */

import {
  CALM_BURST,
  type BurstConfig,
  type BurstEmitter,
  type BurstTint,
  type ConfettiForm,
  type ParticleShape,
} from "./burst-variants";

/** Designs are authored on a card this wide; every length scales with the real card. */
export const DESIGN_WIDTH = 390;

export type Rgb = { r: number; g: number; b: number };

/**
 * Where the word is on the canvas, in CSS px. `hw`/`hh` are the word box's half sizes;
 * `floor`, when known, is the top of the meaning panel below it, which the burst fades
 * out above so the meaning is never drawn over.
 */
export type BurstGeometry = {
  width: number;
  height: number;
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  floor?: number;
};

export type BurstPalette = {
  tone: "dark" | "light";
  /** Each tint as an `rgb()` string, and four shades of it for a confetti chip's turn. */
  tints: Record<BurstTint, string>;
  shades: Record<BurstTint, [string, string, string, string]>;
  rgb: Record<BurstTint, Rgb>;
  /** The colour the bloom and the core are drawn in. */
  bloom: Rgb;
};

type Particle = {
  shape: ParticleShape;
  form: ConfettiForm;
  /** Launch direction (unit vector). */
  dx: number;
  dy: number;
  /** Where it is born: a point on the word's box, a point in the air, or (neither) the outline. */
  anchor: [number, number] | null;
  origin: [number, number] | null;
  /** A rocket's destination; its launch velocity is solved to arrive at the end of its life. */
  target: [number, number] | null;
  offset: number;
  speed: number;
  drag: number;
  gravity: number;
  size: number;
  aspect: number;
  life: number;
  delay: number;
  rot: number;
  spin: number;
  flip: number;
  flipPhase: number;
  flip2: number;
  flip2Phase: number;
  curl: number;
  curlPhase: number;
  fade: number;
  sway: number;
  swayRate: number;
  swayPhase: number;
  twinkle: number;
  twinkleRate: number;
  twinklePhase: number;
  trail: number;
  tint: BurstTint;
};

export type BurstScene = {
  config: BurstConfig;
  calm: boolean;
  /** When the burst lets go, s. Before it, only the core gathers. */
  release: number;
  /** By this time everything has faded to nothing, s. */
  duration: number;
  particles: Particle[];
};

/**
 * A small fast seeded generator, so a seed always throws the same picture.
 * @pure true
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Distance travelled along one axis after `t` seconds, from launch speed `v` under linear
 * drag `k` (1/s) and constant acceleration `g`.
 * @pure true
 */
export function travel(v: number, k: number, g: number, t: number): number {
  if (t <= 0) return 0;
  if (k < 1e-6) return v * t + 0.5 * g * t * t;
  const s = (1 - Math.exp(-k * t)) / k;
  return v * s + (g / k) * (t - s);
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;
const easeOutExpo = (u: number) => (u >= 1 ? 1 : 1 - 2 ** (-10 * u));
const easeOutBack = (u: number) => {
  const c = 1.9;
  return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2;
};

/** Clear space kept around the letters, design px. */
const WORD_PAD = 8;
/** Corner radius of the protected box, design px (never more than half its height). */
const WORD_RADIUS = 18;
/** Over this distance outside the box a particle fades up to full strength, design px. */
const WORD_FADE = 22;

/**
 * Signed distance from (x, y) to the word's protected box: a rounded rectangle a little
 * larger than the letters, whose corners still cover theirs. Negative inside.
 */
function wordDistance(x: number, y: number, geo: BurstGeometry): number {
  const k = geo.width / DESIGN_WIDTH;
  const pad = WORD_PAD * k;
  const r = Math.min(WORD_RADIUS * k, geo.hh + pad);
  const qx = Math.abs(x - geo.cx) - (geo.hw + pad - r);
  const qy = Math.abs(y - geo.cy) - (geo.hh + pad - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * 0 inside the word's box, 1 once clear of it, smooth between: every particle is
 * multiplied by this, so none can ever be drawn across the letters.
 * @pure true
 */
export function keepOut(x: number, y: number, geo: BurstGeometry): number {
  return smoothstep(0, WORD_FADE * (geo.width / DESIGN_WIDTH), wordDistance(x, y, geo));
}

/** The point on the word's box edge in direction (dx, dy), relative to its centre. */
function outlinePoint(dx: number, dy: number, geo: BurstGeometry): [number, number] {
  // The box is convex, so distance only grows along a ray from its centre: bisect.
  let lo = 0;
  let hi = geo.hw + geo.hh + geo.width;
  for (let i = 0; i < 18; i += 1) {
    const mid = (lo + hi) / 2;
    if (wordDistance(geo.cx + dx * mid, geo.cy + dy * mid, geo) < 0) lo = mid;
    else hi = mid;
  }
  return [dx * hi, dy * hi];
}

/**
 * Where the word sits when nothing has measured it: centred at `originY` (% of height),
 * about half the card wide and one large line tall.
 * @pure true
 */
export function wordGeometry(
  width: number,
  height: number,
  originY: number,
  box?: { hw: number; hh: number; cx?: number; cy?: number; floor?: number },
): BurstGeometry {
  return {
    floor: box?.floor,
    width,
    height,
    cx: box?.cx ?? width / 2,
    cy: box?.cy ?? (height * originY) / 100,
    hw: box?.hw ?? width * 0.26,
    hh: box?.hh ?? Math.min(height * 0.04, width * 0.09),
  };
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const between = (rng: () => number, [lo, hi]: [number, number]) => lerp(lo, hi, rng());

/**
 * Throw one design: every particle's launch, life and look, decided once from the seed.
 * With `calm`, the reduced-motion alternative (CALM_BURST) is built instead, and its
 * sparkles are placed and held still.
 * @pure true
 */
export function buildScene(config: BurstConfig, seed: number, calm = false): BurstScene {
  const cfg = calm ? CALM_BURST : config;
  const rng = mulberry32(seed);
  const particles: Particle[] = [];
  let end = 0;
  for (const em of cfg.emitters) {
    for (let i = 0; i < em.count; i += 1) {
      // Stratified around the cone: even coverage with a little jitter, never clumps.
      const slot = (i + 0.2 + rng() * 0.6) / em.count;
      const deg = em.aim + (slot - 0.5) * em.spread;
      const rad = (deg * Math.PI) / 180;
      const p = em.target
        ? makeParticle(em, rng, ...unit(em.target[0], em.target[1]))
        : makeParticle(em, rng, Math.cos(rad), Math.sin(rad));
      // A shell bursts as a sphere seen from the front: most stars travel near its rim.
      if (em.sphere) p.speed *= Math.sqrt(1 - (rng() * 2 - 1) ** 2) * 0.35 + 0.65;
      // An all-round throw from the word leans upward: the word's own stage is above it,
      // the meaning below, so what heads down is thrown softer.
      else if (em.spread >= 300 && !em.origin && !em.anchor) {
        p.speed *= 1 - LIFT * Math.max(0, p.dy);
      }
      particles.push(p);
      end = Math.max(end, p.delay + p.life);
    }
  }
  const release = cfg.anticipation;
  if (cfg.bloom) end = Math.max(end, cfg.bloom.rise + cfg.bloom.decay);
  if (cfg.rings) end = Math.max(end, cfg.rings.dur + cfg.rings.stagger * (cfg.rings.count - 1));
  if (cfg.rays) end = Math.max(end, cfg.rays.dur);
  if (cfg.core) end = Math.max(end, CORE_FLASH);
  return { config: cfg, calm, release, duration: release + end, particles };
}

const unit = (x: number, y: number): [number, number] => {
  const n = Math.hypot(x, y) || 1;
  return [x / n, y / n];
};

/** Where each shape starts to fade by default (share of its life). */
const FADE_FROM: Record<ParticleShape, number> = {
  streak: 0.35,
  glint: 0.5,
  confetti: 0.72,
  dot: 0.5,
  flash: 0,
};

function makeParticle(em: BurstEmitter, rng: () => number, dx: number, dy: number): Particle {
  const forms = em.forms ?? ["chip"];
  return {
    shape: em.shape,
    form: forms[Math.floor(rng() * forms.length)] ?? "chip",
    dx,
    dy,
    anchor: em.anchor ?? null,
    origin: em.origin ?? null,
    target: em.target ?? null,
    offset: em.offset ? between(rng, em.offset) : 0,
    speed: between(rng, em.speed),
    drag: em.drag,
    gravity: em.gravity * lerp(0.85, 1.15, rng()),
    size: between(rng, em.size),
    aspect: lerp(0.42, 0.62, rng()),
    life: between(rng, em.life),
    delay: between(rng, em.delay),
    rot: rng() * Math.PI * 2,
    spin: (em.spin ?? 0) * lerp(-1, 1, rng()),
    // Confetti tumbles about two axes at unrelated rates, so it never repeats a pose.
    flip: lerp(4, 9, rng()),
    flipPhase: rng() * Math.PI * 2,
    flip2: lerp(1.6, 4.2, rng()),
    flip2Phase: rng() * Math.PI * 2,
    curl: lerp(6, 11, rng()),
    curlPhase: rng() * Math.PI * 2,
    fade: em.fade ?? FADE_FROM[em.shape],
    sway: (em.sway ?? 0) * lerp(0.6, 1, rng()),
    swayRate: lerp(3.2, 5.2, rng()),
    swayPhase: rng() * Math.PI * 2,
    twinkle: em.twinkle ?? 0,
    twinkleRate: lerp(16, 30, rng()),
    twinklePhase: rng() * Math.PI * 2,
    trail: em.trail ?? 0,
    tint: em.tints[Math.floor(rng() * em.tints.length)] ?? "accent",
  };
}

/** How much softer an all-round throw is straight down than straight up (0–1). */
const LIFT = 0.32;
/** The band above the meaning panel over which the burst fades away, design px. */
const FLOOR_FADE = 34;

/** How long the core's release flash lasts, s. */
const CORE_FLASH = 0.26;

export type ParticleFrame = {
  x: number;
  y: number;
  /** Where it was `trail` seconds ago (streaks), or the same point. */
  tx: number;
  ty: number;
  alpha: number;
  size: number;
  rot: number;
  /** cos of the chip's turn about its long axis, for confetti; 1 otherwise. */
  turn: number;
  /** cos of its turn about the other axis, for confetti; 1 otherwise. */
  turn2: number;
  /** -1..1: how a ribbon is curled at this moment. */
  curl: number;
};

/**
 * One particle at scene time `t`, or null while it is not on screen.
 * @pure true
 */
export function particleAt(
  p: Particle,
  scene: BurstScene,
  t: number,
  geo: BurstGeometry,
): ParticleFrame | null {
  const tau = t - scene.release - p.delay;
  if (tau < 0 || tau >= p.life) return null;
  const k = geo.width / DESIGN_WIDTH;
  const u = tau / p.life;
  const pad = WORD_PAD * k;
  let [bx, by] = [0, 0];
  if (p.origin) [bx, by] = [p.origin[0] * k, p.origin[1] * k];
  else if (p.anchor) [bx, by] = [p.anchor[0] * (geo.hw + pad), p.anchor[1] * (geo.hh + pad)];
  else [bx, by] = outlinePoint(p.dx, p.dy, geo);
  const sx = geo.cx + bx + p.dx * p.offset * k;
  const sy = geo.cy + by + p.dy * p.offset * k;
  // A rocket's launch is solved so it arrives at its target exactly as its life ends.
  const vx = p.target ? (geo.cx + p.target[0] * k - sx) / p.life : p.dx * p.speed * k;
  const vy = p.target
    ? (geo.cy + p.target[1] * k - sy) / p.life - 0.5 * p.gravity * k * p.life
    : p.dy * p.speed * k;
  const drag = p.target ? 0 : p.drag;
  const pos = (time: number): [number, number] => {
    let x = sx + travel(vx, drag, 0, time);
    const y = sy + travel(vy, drag, p.gravity * k, time);
    if (p.sway) {
      // The flutter grows as the throw's own speed dies away.
      const slow = 1 - Math.exp(-Math.max(p.drag, 1) * time);
      x += p.sway * k * slow * Math.sin(p.swayRate * time + p.swayPhase);
    }
    return [x, y];
  };
  const [x, y] = scene.calm ? [sx, sy] : pos(tau);
  const [tx, ty] = p.trail && !scene.calm ? pos(Math.max(0, tau - p.trail)) : [x, y];

  let alpha: number;
  let size = p.size * k;
  if (scene.calm) {
    // Opacity only: up, hold, down. Nothing moves or scales.
    alpha = smoothstep(0, 0.3, u) * (1 - smoothstep(0.6, 1, u));
  } else {
    alpha = clamp01(tau / (p.shape === "flash" ? 0.025 : 0.04)) * (1 - smoothstep(p.fade, 1, u));
    if (p.shape === "flash") {
      alpha *= (1 - u) ** 1.6;
      size *= lerp(0.45, 1, easeOutCubic(u));
    } else if (p.shape === "glint") {
      size *= easeOutBack(clamp01(tau / 0.18)) * (1 - 0.55 * smoothstep(0.45, 1, u));
    } else if (p.shape === "dot") {
      size *= 1 - 0.5 * u;
    } else if (p.shape === "streak") {
      size *= Math.sqrt(1 - u);
    }
  }
  if (p.twinkle) {
    const blink = 0.5 + 0.5 * Math.sin(p.twinkleRate * tau + p.twinklePhase);
    alpha *= 1 - p.twinkle * blink * smoothstep(0.08, 0.3, u);
  }
  alpha *= keepOut(x, y, geo);
  if (geo.floor !== undefined) alpha *= 1 - smoothstep(geo.floor - FLOOR_FADE * k, geo.floor, y);
  if (alpha <= 0.002 || size <= 0.05) return null;
  const spun = p.drag > 0 ? (1 - Math.exp(-p.drag * tau)) / p.drag : tau;
  let rot = scene.calm ? p.rot : p.rot + p.spin * (0.65 * spun + 0.35 * tau);
  const paper = p.shape === "confetti" && !scene.calm;
  if (paper && p.sway) {
    // A falling piece leans into each swing, like a leaf.
    const slow = 1 - Math.exp(-Math.max(p.drag, 1) * tau);
    rot += 0.5 * slow * Math.cos(p.swayRate * tau + p.swayPhase);
  }
  const turn = paper ? Math.cos(p.flip * tau + p.flipPhase) : 1;
  const turn2 = paper ? Math.cos(p.flip2 * tau + p.flip2Phase) : 1;
  const curl = paper ? Math.sin(p.curl * tau + p.curlPhase) : 0;
  return { x, y, tx, ty, alpha, size, rot, turn, turn2, curl };
}

/**
 * Parse any CSS colour the card hands over (hex, rgb(), or a name via `normalise`).
 * @pure true
 */
export function parseColor(input: string, normalise?: (css: string) => string): Rgb | null {
  const css = input.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(css)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(css);
  if (rgb) return { r: +rgb[1]!, g: +rgb[2]!, b: +rgb[3]! };
  if (normalise && css) {
    const out = normalise(css);
    if (out && out !== css) return parseColor(out);
  }
  return null;
}

const mix = (a: Rgb, b: Rgb, u: number): Rgb => ({
  r: Math.round(lerp(a.r, b.r, u)),
  g: Math.round(lerp(a.g, b.g, u)),
  b: Math.round(lerp(a.b, b.b, u)),
});
const css = (c: Rgb) => `rgb(${c.r},${c.g},${c.b})`;
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

function toHsl({ r, g, b }: Rgb): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const hue = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    const v =
      x < 1 / 6
        ? p + (q - p) * 6 * x
        : x < 1 / 2
          ? q
          : x < 2 / 3
            ? p + (q - p) * (2 / 3 - x) * 6
            : p;
    return Math.round(v * 255);
  };
  return { r: channel(hue + 1 / 3), g: channel(hue), b: channel(hue - 1 / 3) };
}

const hueGap = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(d, 360 - d);
};

/**
 * A third festive hue for the card: the turn of the accent's hue that sits farthest from
 * both accents, at a lightness that reads on the card's tone.
 * @pure true
 */
export function popHue(tone: "dark" | "light", accent: Rgb, alt: Rgb): Rgb {
  const [h, s, l] = toHsl(accent);
  const altHue = toHsl(alt)[0];
  let best = h + 180;
  for (const turn of [120, 150, 180, 210, 240]) {
    const cand = h + turn;
    if (
      Math.min(hueGap(cand, h), hueGap(cand, altHue)) >
      Math.min(hueGap(best, h), hueGap(best, altHue))
    ) {
      best = cand;
    }
  }
  return tone === "dark"
    ? fromHsl(best, Math.max(s, 0.7), Math.min(Math.max(l, 0.62), 0.72))
    : fromHsl(best, Math.max(s, 0.62), Math.min(Math.max(l, 0.34), 0.44));
}

/**
 * Resolve the design's tints against the card. On a deep card the light tints climb
 * toward white so they glow; on a pale card (whose accents are deep inks) they stay
 * saturated so they read against the paper.
 * @pure true
 */
export function resolvePalette(tone: "dark" | "light", accent: Rgb, alt: Rgb): BurstPalette {
  const rgb: Record<BurstTint, Rgb> =
    tone === "dark"
      ? {
          accent,
          alt,
          light: mix(accent, WHITE, 0.55),
          hot: mix(alt, WHITE, 0.82),
          pop: popHue(tone, accent, alt),
          gold: { r: 255, g: 204, b: 92 },
        }
      : {
          accent,
          alt,
          light: mix(accent, alt, 0.5),
          hot: mix(accent, WHITE, 0.12),
          pop: popHue(tone, accent, alt),
          gold: { r: 184, g: 132, b: 18 },
        };
  const tints = {} as BurstPalette["tints"];
  const shades = {} as BurstPalette["shades"];
  for (const key of Object.keys(rgb) as BurstTint[]) {
    const c = rgb[key];
    tints[key] = css(c);
    // A chip facing the light catches a sheen; turned edge-on it falls into shadow.
    shades[key] = [
      css(mix(c, WHITE, 0.3)),
      css(c),
      css(mix(c, BLACK, 0.2)),
      css(mix(c, BLACK, 0.4)),
    ];
  }
  return { tone, tints, shades, rgb, bloom: tone === "dark" ? accent : WHITE };
}

export type BurstSprites = {
  /** Soft radial light in the bloom colour (pale centre on a deep card). */
  bloom: CanvasImageSource;
  /** A small soft glow per tint, drawn behind a sparkle on a deep card. */
  glow: Record<BurstTint, CanvasImageSource>;
  /** The ray fan, if the design has one. */
  rays: CanvasImageSource | null;
};

type MakeCanvas = (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas;

function radialSprite(make: MakeCanvas, size: number, stops: [number, string][]) {
  const c = make(size, size);
  const g = c.getContext("2d") as CanvasRenderingContext2D | null;
  if (!g) return c;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, col] of stops) grad.addColorStop(at, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}
const rgba = (c: Rgb, a: number) => `rgba(${c.r},${c.g},${c.b},${a})`;

/**
 * Pre-render the soft pieces once per burst, so a frame only scales and blits them.
 */
export function buildSprites(
  scene: BurstScene,
  palette: BurstPalette,
  make: MakeCanvas,
): BurstSprites {
  const b = palette.bloom;
  const centre = palette.tone === "dark" ? mix(b, WHITE, 0.35) : WHITE;
  const bloom = radialSprite(make, 256, [
    [0, rgba(centre, 1)],
    [0.3, rgba(b, 0.62)],
    [0.62, rgba(b, 0.2)],
    [1, rgba(b, 0)],
  ]);
  const glow = {} as BurstSprites["glow"];
  for (const key of Object.keys(palette.rgb) as BurstTint[]) {
    const c = palette.rgb[key];
    glow[key] = radialSprite(make, 64, [
      [0, rgba(c, 0.85)],
      [0.35, rgba(c, 0.28)],
      [1, rgba(c, 0)],
    ]);
  }
  let rays: CanvasImageSource | null = null;
  const spec = scene.config.rays;
  if (spec) {
    const size = 768;
    const c = make(size, size);
    const g = c.getContext("2d") as CanvasRenderingContext2D | null;
    if (g) {
      const col =
        palette.tone === "dark" ? mix(palette.rgb.accent, WHITE, 0.45) : palette.rgb.accent;
      const r = size / 2;
      const grad = g.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, rgba(col, 0));
      grad.addColorStop(0.16, rgba(col, 0.9));
      grad.addColorStop(0.5, rgba(col, 0.35));
      grad.addColorStop(1, rgba(col, 0));
      g.fillStyle = grad;
      for (let i = 0; i < spec.count; i += 1) {
        const a = (i / spec.count) * Math.PI * 2;
        const reach = r * (i % 2 ? 0.72 : 1);
        const half = (Math.PI / spec.count) * (i % 2 ? 0.22 : 0.34);
        g.beginPath();
        g.moveTo(r, r);
        g.lineTo(r + Math.cos(a - half) * reach, r + Math.sin(a - half) * reach);
        g.lineTo(r + Math.cos(a + half) * reach, r + Math.sin(a + half) * reach);
        g.closePath();
        g.fill();
      }
    }
    rays = c;
  }
  return { bloom, glow, rays };
}

/**
 * Paint the scene at time `t` (s since mount). The context's transform is reset to
 * `dpr` here, so the caller only sizes the canvas.
 */
export function drawBurst(
  ctx: CanvasRenderingContext2D,
  scene: BurstScene,
  t: number,
  geo: BurstGeometry,
  palette: BurstPalette,
  sprites: BurstSprites,
  dpr: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (t < 0 || t > scene.duration) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cfg = scene.config;
  const k = geo.width / DESIGN_WIDTH;
  const dark = palette.tone === "dark";
  const glowMode: GlobalCompositeOperation = dark ? "lighter" : "source-over";
  const after = t - scene.release;

  // Rays: a slow turn behind the word, rising and settling with the bloom.
  if (cfg.rays && sprites.rays && after >= 0 && !scene.calm) {
    const u = after / cfg.rays.dur;
    if (u < 1) {
      const env = smoothstep(0, 0.22, u) * (1 - smoothstep(0.45, 1, u));
      const radius = cfg.rays.length * k * lerp(0.7, 1.08, easeOutCubic(clamp01(u * 1.4)));
      ctx.globalCompositeOperation = glowMode;
      ctx.globalAlpha = cfg.rays.peak * env * (dark ? 1 : 0.55);
      const turn = (cfg.rays.spin * Math.PI * after) / 180;
      ctx.setTransform(
        dpr * Math.cos(turn),
        dpr * Math.sin(turn),
        -dpr * Math.sin(turn),
        dpr * Math.cos(turn),
        geo.cx * dpr,
        geo.cy * dpr,
      );
      ctx.drawImage(sprites.rays, -radius, -radius, radius * 2, radius * 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  // Bloom: light swelling behind the word, a touch wider than it, then settling away.
  if (cfg.bloom) {
    const { size, peak, rise, decay } = cfg.bloom;
    const local = scene.calm ? t : after + rise * 0.6;
    if (local >= 0 && local < rise + decay) {
      const up = smoothstep(0, rise, local);
      const down = 1 - smoothstep(rise, rise + decay, local);
      const env = up * down * down;
      const grow = scene.calm
        ? 1
        : lerp(0.6, 1, easeOutCubic(clamp01(local / rise))) +
          0.14 * clamp01((local - rise) / decay);
      const w = Math.min((geo.hw + 46 * k) * size * grow, geo.width * 0.9);
      const h = (geo.hh + 46 * k) * size * grow * 1.15;
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      ctx.globalAlpha = peak * env * (dark ? 0.8 : 1);
      ctx.drawImage(sprites.bloom, geo.cx - w, geo.cy - h, w * 2, h * 2);
    }
  }

  // Core: the inhale (a pinpoint gathering), then the release flash.
  if (cfg.core && !scene.calm) {
    let r = 0;
    let a = 0;
    if (t < scene.release) {
      const u = t / scene.release;
      r = cfg.core * k * lerp(0.2, 0.75, u * u);
      a = 0.5 + 0.5 * u;
    } else if (after < CORE_FLASH) {
      const u = after / CORE_FLASH;
      r = cfg.core * k * lerp(0.75, 3, easeOutCubic(u));
      a = (1 - u) ** 2;
    }
    if (a > 0 && r > 0) {
      ctx.globalCompositeOperation = glowMode;
      ctx.globalAlpha = a;
      ctx.drawImage(sprites.glow.hot, geo.cx - r * 2, geo.cy - r * 2, r * 4, r * 4);
    }
  }

  // Rings: thin circles that start just clear of the word's corners, so they never cross
  // the letters, and spread out round; the stroke thins as it travels.
  if (cfg.rings && !scene.calm) {
    const { count, grow, width, stagger, dur } = cfg.rings;
    ctx.globalCompositeOperation = glowMode;
    ctx.strokeStyle = dark ? palette.tints.light : palette.tints.accent;
    for (let i = 0; i < count; i += 1) {
      const u = (after - i * stagger) / dur;
      if (u < 0 || u >= 1) continue;
      const g = grow * k * (1 + i * 0.35) * easeOutExpo(u);
      ctx.globalAlpha = (i ? 0.6 : 0.95) * (1 - u) ** 1.5 * smoothstep(0, 0.1, u);
      ctx.lineWidth = Math.max(0.6, width * k * (1 - u) ** 1.2);
      const radius = Math.hypot(geo.hw, geo.hh) + WORD_PAD * k + g;
      ctx.beginPath();
      ctx.arc(geo.cx, geo.cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Particles: paper first (it is opaque), then light on top.
  for (const pass of PASSES) {
    ctx.globalCompositeOperation = pass === "confetti" ? "source-over" : glowMode;
    for (const p of scene.particles) {
      if (p.shape !== pass) continue;
      const f = particleAt(p, scene, t, geo);
      if (f) drawParticle(ctx, p, f, palette, sprites, dpr, dark);
    }
  }
  // Whatever reached the meaning panel (the bloom's foot, a ring) fades out above it.
  if (geo.floor !== undefined && geo.floor < geo.height) {
    const top = geo.floor - FLOOR_FADE * k;
    const fade = ctx.createLinearGradient(0, top, 0, geo.floor);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(1, "rgba(0,0,0,1)");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 1;
    ctx.fillStyle = fade;
    ctx.fillRect(0, top, geo.width, geo.height - top);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

const PASSES: ParticleShape[] = ["flash", "confetti", "streak", "dot", "glint"];

function drawParticle(
  ctx: CanvasRenderingContext2D,
  p: Particle,
  f: ParticleFrame,
  palette: BurstPalette,
  sprites: BurstSprites,
  dpr: number,
  dark: boolean,
) {
  ctx.globalAlpha = f.alpha;
  switch (p.shape) {
    case "flash": {
      const r = f.size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(sprites.glow[p.tint], f.x - r, f.y - r, r * 2, r * 2);
      return;
    }
    case "streak": {
      const dx = f.x - f.tx;
      const dy = f.y - f.ty;
      const len = Math.hypot(dx, dy);
      const w = f.size / 2;
      ctx.fillStyle = palette.tints[p.tint];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      if (len < w) {
        ctx.arc(f.x, f.y, w, 0, Math.PI * 2);
      } else {
        // A comet: round bright head, tail tapering to a point along its own path.
        const ang = Math.atan2(dy, dx);
        ctx.moveTo(f.tx, f.ty);
        ctx.lineTo(f.x + Math.cos(ang + Math.PI / 2) * w, f.y + Math.sin(ang + Math.PI / 2) * w);
        ctx.arc(f.x, f.y, w, ang + Math.PI / 2, ang - Math.PI / 2, true);
        ctx.closePath();
      }
      ctx.fill();
      if (p.target) {
        // A rocket's head burns: a soft glow around the bright point.
        const r = f.size * 3.2;
        ctx.drawImage(sprites.glow[p.tint], f.x - r, f.y - r, r * 2, r * 2);
      }
      return;
    }
    case "dot": {
      ctx.fillStyle = palette.tints[p.tint];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case "glint": {
      const r = f.size;
      if (dark) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = f.alpha * 0.7;
        ctx.drawImage(sprites.glow[p.tint], f.x - r * 2.2, f.y - r * 2.2, r * 4.4, r * 4.4);
        ctx.globalAlpha = f.alpha;
      }
      const c = Math.cos(f.rot) * dpr;
      const s = Math.sin(f.rot) * dpr;
      ctx.setTransform(c, s, -s, c, f.x * dpr, f.y * dpr);
      ctx.fillStyle = palette.tints[p.tint];
      const pinch = r * 0.13;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(pinch, -pinch, r, 0);
      ctx.quadraticCurveTo(pinch, pinch, 0, r);
      ctx.quadraticCurveTo(-pinch, pinch, -r, 0);
      ctx.quadraticCurveTo(-pinch, -pinch, 0, -r);
      ctx.fill();
      return;
    }
    case "confetti": {
      // A piece tumbling about two axes: its outline foreshortens on each, and it catches
      // the light face-on and falls into shadow edge-on.
      const facing = Math.abs(f.turn * f.turn2);
      const shade =
        palette.shades[p.tint][facing > 0.72 ? 0 : facing > 0.38 ? 1 : facing > 0.14 ? 2 : 3];
      const c = Math.cos(f.rot);
      const s = Math.sin(f.rot);
      const sx = Math.max(0.12, Math.abs(f.turn2)) * Math.sign(f.turn2 || 1);
      const sy = Math.max(0.08, Math.abs(f.turn)) * Math.sign(f.turn || 1);
      ctx.setTransform(
        c * sx * dpr,
        s * sx * dpr,
        -s * sy * dpr,
        c * sy * dpr,
        f.x * dpr,
        f.y * dpr,
      );
      const w = f.size;
      switch (p.form) {
        case "square":
          ctx.fillStyle = shade;
          ctx.fillRect(-w * 0.36, -w * 0.36, w * 0.72, w * 0.72);
          return;
        case "disc":
          ctx.fillStyle = shade;
          ctx.beginPath();
          ctx.arc(0, 0, w * 0.36, 0, Math.PI * 2);
          ctx.fill();
          return;
        case "ribbon": {
          // A streamer: a long thin strip whose curl rolls along it as it falls.
          const half = w * 0.95;
          const bend = w * 0.45 * f.curl;
          ctx.strokeStyle = shade;
          ctx.lineWidth = w * 0.2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(-half, -bend * 0.4);
          ctx.bezierCurveTo(-half / 3, -bend, half / 3, bend, half, bend * 0.4);
          ctx.stroke();
          return;
        }
        default: {
          const h = w * p.aspect;
          ctx.fillStyle = shade;
          ctx.fillRect(-w / 2, -h / 2, w, h);
          return;
        }
      }
    }
  }
}
