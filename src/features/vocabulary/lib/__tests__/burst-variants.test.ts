import { describe, expect, it } from "vitest";
import {
  BURST_CONFIG,
  BURST_INFO,
  BURST_ROTATION,
  BURST_VARIANTS,
  CALM_BURST,
  DEFAULT_BURST_VARIANT,
  MAX_BURST_PARTICLES,
  pickBurstVariant,
} from "../burst-variants";
import {
  buildScene,
  keepOut,
  parseColor,
  particleAt,
  resolvePalette,
  travel,
  wordGeometry,
} from "../burst-engine";

const PHONE = wordGeometry(390, 844, 34, { hw: 120, hh: 34 });

/** Every visible particle frame of a scene, sampled at 120 Hz. */
function frames(variant: (typeof BURST_VARIANTS)[number], calm = false, geo = PHONE) {
  const scene = buildScene(BURST_CONFIG[variant], 7, calm);
  const out: { t: number; x: number; y: number; alpha: number; shape: string }[] = [];
  for (let t = 0; t <= scene.duration + 0.05; t += 1 / 120) {
    for (const p of scene.particles) {
      const f = particleAt(p, scene, t, geo);
      if (f) out.push({ t, x: f.x, y: f.y, alpha: f.alpha, shape: p.shape });
    }
  }
  return { scene, out };
}

describe("burst-variants", () => {
  it("names and configures every design, and the feed default is one of them", () => {
    expect(BURST_VARIANTS).toContain(DEFAULT_BURST_VARIANT);
    for (const variant of BURST_VARIANTS) {
      expect(BURST_INFO[variant].label).toBeTruthy();
      expect(BURST_INFO[variant].blurb).toBeTruthy();
      expect(BURST_CONFIG[variant].emitters.length).toBeGreaterThan(0);
    }
  });

  it("rotates the feed through classic, stardust and halo, the same design per word", () => {
    expect([...BURST_ROTATION]).toEqual(["classic", "stardust", "halo"]);
    const ids = Array.from({ length: 300 }, (_, i) => `word-${i}`);
    const picks = ids.map(pickBurstVariant);
    expect(new Set(picks)).toEqual(new Set(BURST_ROTATION));
    for (const variant of BURST_ROTATION) {
      // Each takes a fair share of the stream.
      expect(picks.filter((pick) => pick === variant).length).toBeGreaterThan(70);
    }
    expect(ids.map(pickBurstVariant)).toEqual(picks);
  });

  it("keeps every design within the phone particle budget", () => {
    for (const variant of BURST_VARIANTS) {
      const total = BURST_CONFIG[variant].emitters.reduce((sum, em) => sum + em.count, 0);
      expect(total, variant).toBeLessThanOrEqual(MAX_BURST_PARTICLES);
    }
  });

  it("anticipates, then settles: every design is over in under 3.2 s", () => {
    for (const variant of BURST_VARIANTS) {
      const scene = buildScene(BURST_CONFIG[variant], 1);
      expect(scene.release, variant).toBeGreaterThan(0);
      expect(scene.release, variant).toBeLessThan(0.15);
      expect(scene.duration, variant).toBeLessThan(3.2);
    }
  });
});

describe("burst-engine physics", () => {
  it("matches a finely stepped simulation of drag and gravity", () => {
    const v = 900;
    const k = 3.2;
    const g = 700;
    let x = 0;
    let vel = v;
    const dt = 1e-5;
    for (let t = 0; t < 0.8; t += dt) {
      vel += (g - k * vel) * dt;
      x += vel * dt;
    }
    expect(travel(v, k, g, 0.8)).toBeCloseTo(x, 0);
    // Without drag it is plain projectile motion.
    expect(travel(10, 0, 4, 2)).toBeCloseTo(28, 6);
  });

  it("throws the same picture for the same seed and a different one for another", () => {
    const a = buildScene(BURST_CONFIG.confetti, 42);
    expect(buildScene(BURST_CONFIG.confetti, 42)).toEqual(a);
    expect(buildScene(BURST_CONFIG.confetti, 43)).not.toEqual(a);
  });

  it("never draws a particle over the word", () => {
    expect(keepOut(PHONE.cx, PHONE.cy, PHONE)).toBe(0);
    expect(keepOut(PHONE.cx + PHONE.hw * 0.9, PHONE.cy, PHONE)).toBe(0);
    expect(keepOut(PHONE.cx, PHONE.cy - 200, PHONE)).toBe(1);
    for (const variant of BURST_VARIANTS) {
      for (const f of frames(variant).out) {
        const inside = Math.abs(f.x - PHONE.cx) <= PHONE.hw && Math.abs(f.y - PHONE.cy) <= PHONE.hh;
        expect(inside && f.alpha > 0, `${variant} @${f.t.toFixed(3)}`).toBe(false);
      }
    }
  });

  it("has faded everything by the scene's end", () => {
    for (const variant of BURST_VARIANTS) {
      const scene = buildScene(BURST_CONFIG[variant], 3);
      const late = scene.particles.map((p) => particleAt(p, scene, scene.duration, PHONE));
      expect(
        late.every((f) => f === null),
        variant,
      ).toBe(true);
    }
  });

  it("fades in rather than popping: no particle starts at full strength", () => {
    for (const variant of BURST_VARIANTS) {
      const scene = buildScene(BURST_CONFIG[variant], 5);
      for (const p of scene.particles) {
        const first = particleAt(p, scene, scene.release + p.delay + 1 / 240, PHONE);
        expect(first?.alpha ?? 0, variant).toBeLessThan(0.5);
      }
    }
  });

  it("keeps the calm form motionless: sparkles hold their place and only fade", () => {
    const scene = buildScene(BURST_CONFIG.fireworks, 9, true);
    expect(scene.config).toBe(CALM_BURST);
    for (const p of scene.particles) {
      const seen = [0.2, 0.4, 0.6, 0.8, 1, 1.2]
        .map((t) => particleAt(p, scene, t, PHONE))
        .filter((f) => f !== null);
      expect(seen.length).toBeGreaterThan(0);
      for (const f of seen) {
        expect(f.x).toBeCloseTo(seen[0]!.x, 6);
        expect(f.y).toBeCloseTo(seen[0]!.y, 6);
        expect(f.size).toBeCloseTo(seen[0]!.size, 6);
        expect(f.rot).toBeCloseTo(seen[0]!.rot, 6);
      }
    }
  });

  it("lands every firework rocket exactly on its shell as the shell bursts", () => {
    const scene = buildScene(BURST_CONFIG.fireworks, 4);
    const rockets = scene.particles.filter((p) => p.target);
    expect(rockets).toHaveLength(3);
    for (const rocket of rockets) {
      // A rocket has burned out at the instant it arrives (the shell's flash takes over),
      // so look at it in its last moments: it is within a pixel or two of the shell.
      const late = scene.release + rocket.delay + rocket.life * 0.99;
      const f = particleAt(rocket, scene, late, PHONE)!;
      expect(Math.abs(f.x - (PHONE.cx + rocket.target![0]))).toBeLessThan(3);
      expect(Math.abs(f.y - (PHONE.cy + rocket.target![1]))).toBeLessThan(3);
      // Its shell's stars leave from that same point as the rocket goes out.
      const stars = scene.particles.filter(
        (p) => p.origin?.[0] === rocket.target![0] && p.origin?.[1] === rocket.target![1],
      );
      expect(Math.min(...stars.map((p) => p.delay))).toBeCloseTo(rocket.delay + rocket.life, 6);
    }
  });

  it("lets confetti climb, hang and then fall", () => {
    const scene = buildScene(BURST_CONFIG.confetti, 6);
    const paper = scene.particles.filter((p) => p.shape === "confetti");
    const fell = paper.filter((p) => {
      const at = (u: number) => particleAt(p, scene, scene.release + p.delay + p.life * u, PHONE);
      const early = at(0.08);
      const late = at(0.6);
      return early && late && late.y > early.y - 40;
    });
    // Nearly every piece that is still on screen is on its way down by mid-life.
    expect(fell.length).toBeGreaterThan(paper.length * 0.5);
    expect(new Set(paper.map((p) => p.form))).toEqual(
      new Set(["chip", "square", "disc", "ribbon"]),
    );
  });

  it("scales with the card, so a lab miniature is the phone picture shrunk", () => {
    const small = wordGeometry(195, 422, 34, { hw: 60, hh: 17 });
    const scene = buildScene(BURST_CONFIG.classic, 11);
    const p = scene.particles[0]!;
    const t = scene.release + p.delay + 0.2;
    const big = particleAt(p, scene, t, PHONE)!;
    const tiny = particleAt(p, scene, t, small)!;
    expect(tiny.x - small.cx).toBeCloseTo((big.x - PHONE.cx) / 2, 4);
    expect(tiny.y - small.cy).toBeCloseTo((big.y - PHONE.cy) / 2, 4);
  });
});

describe("burst-engine colour", () => {
  it("parses the colours a card hands over", () => {
    expect(parseColor("#ffd23d")).toEqual({ r: 255, g: 210, b: 61 });
    expect(parseColor(" #abc ")).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseColor("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3 });
    expect(parseColor("rgba(1 2 3 / 50%)")).toEqual({ r: 1, g: 2, b: 3 });
    expect(parseColor("hotpink", () => "#ff69b4")).toEqual({ r: 255, g: 105, b: 180 });
    expect(parseColor("")).toBeNull();
  });

  it("brightens light on a deep card and keeps ink saturated on a pale one", () => {
    const accent = { r: 180, g: 97, b: 14 };
    const alt = { r: 160, g: 16, b: 209 };
    const dark = resolvePalette("dark", accent, alt);
    const light = resolvePalette("light", accent, alt);
    const lum = (c: { r: number; g: number; b: number }) => c.r + c.g + c.b;
    expect(lum(dark.rgb.hot)).toBeGreaterThan(lum(accent) + 200);
    expect(lum(light.rgb.hot)).toBeLessThan(lum(accent) + 100);
    // On a pale card the bloom is white light behind dark letters, never a tint over them.
    expect(light.bloom).toEqual({ r: 255, g: 255, b: 255 });
  });
});
