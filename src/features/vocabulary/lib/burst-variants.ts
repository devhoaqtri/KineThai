/**
 * The reveal celebration as a family of designs to choose from, not one hard-coded look.
 *
 * The default (classic) is a radial burst: an accent bloom, one expanding ring, and a fan
 * of spark streaks thrown from the word's centre. Every design here is the same three CSS
 * atoms — flash, ring, sparks — plus optional star/sweep atoms, recombined on four axes:
 * which atoms fire, the spark shape and motion, the timing (and therefore how crisp or how
 * soft it reads), and the overall scale. Nothing here owns a clock; components/RevealBurst
 * renders these knobs into CSS custom properties and data-* attributes, and vocabulary.css
 * does the animating. Mount with a fresh key to replay.
 *
 * Colours are never in the table: each atom reads --vocab-accent / --vocab-accent-alt /
 * --vocab-ink, so a card's own palette re-skins every variant for free.
 *
 * Exports: BURST_VARIANTS, BurstVariant, BURST_INFO, BurstConfig, BURST_CONFIG, sparkFan
 * Depends on: nothing (pure data + a deterministic layout helper)
 */

export const BURST_VARIANTS = [
  "classic",
  "snap",
  "bloom",
  "shockwave",
  "rays",
  "twinkle",
  "pinwheel",
  "fountain",
  "ripple",
  "halo",
  "starburst",
  "shimmer",
  "pop",
  "ember",
  "sprinkle",
] as const;
export type BurstVariant = (typeof BURST_VARIANTS)[number];

/** How each design is named and described where one is picked. */
export const BURST_INFO: Record<BurstVariant, { label: string; blurb: string }> = {
  classic: { label: "Burst mặc định", blurb: "Quầng sáng, một vòng tròn và các tia — kiểu đang dùng." },
  snap: { label: "Nhanh gọn", blurb: "Cùng các tia nhưng ngắn và chặt hơn, cảm giác 'pop' tức thì." },
  bloom: { label: "Nở hoa", blurb: "Quầng sáng lớn, mềm, lan chậm; vài chấm nhẹ quanh." },
  shockwave: { label: "Sóng xung kích", blurb: "Ba vòng tròn nở liền nhau, tia mảnh đuổi theo sau." },
  rays: { label: "Tia tỏa", blurb: "Chỉ 24 tia mảnh tỏa đều quanh chữ, không vòng tròn." },
  twinkle: { label: "Lấp lánh", blurb: "Những ngôi sao nhỏ nhấp nháy quanh chữ rồi mờ dần." },
  pinwheel: { label: "Cối xoay", blurb: "Các tia xoáy tròn khi bay ra, như chong chóng." },
  fountain: { label: "Phun lên", blurb: "Chùm tia phun ngược lên trên rồi rơi xuống như đài phun." },
  ripple: { label: "Gợn sóng", blurb: "Chỉ vòng tròn, ba lớp nở ra như sóng trên mặt nước." },
  halo: { label: "Vầng hào quang", blurb: "Quầng sáng dịu và một vòng mỏng, mở chậm, trang nhã." },
  starburst: { label: "Chòm sao", blurb: "12 ngôi sao bắn tỏa tức thì kèm chớp sáng." },
  shimmer: { label: "Ánh lướt", blurb: "Một vệt sáng lướt ngang qua chữ, không tia nào." },
  pop: { label: "Nảy bật", blurb: "Chấm tròn nảy to rồi bật nhẹ, vui nhộn." },
  ember: { label: "Tàn lửa", blurb: "Những đốm nhỏ bay lên chậm, lơ lửng rồi tắt." },
  sprinkle: { label: "Rắc màu", blurb: "Nhiều chấm đủ màu tung ra từ tâm chữ." },
};

export type FlashMode = "none" | "radial" | "conic";
export type SparkShape = "pill" | "dot" | "streak" | "star";
export type SparkMotion = "out" | "spin" | "fountain" | "drift";
export type BurstEase = "out" | "pop" | "linear";

/** Every knob a design sets, translated straight onto the burst element by RevealBurst. */
export type BurstConfig = {
  flash: FlashMode;
  /** 0–3 concentric rings; each later one lags and expands further. */
  rings: number;
  /** 0–24 sparks fanned around the word. */
  sparks: number;
  sparkShape: SparkShape;
  motion: SparkMotion;
  /** A shine band that sweeps across the word once. */
  sweep: boolean;
  /** Overall size multiplier, so reach, ring and spark scale together. */
  scale: number;
  /** Seconds per atom; 0 skips that atom's timing (it does not fire anyway). */
  flashDur: number;
  ringDur: number;
  sparkDur: number;
  ease: BurstEase;
};

/** The resolved easing curves; kept literal so they can travel as an inline custom property. */
export const BURST_EASE: Record<BurstEase, string> = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  pop: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  linear: "cubic-bezier(0.33, 0, 0.67, 1)",
};

export const BURST_CONFIG: Record<BurstVariant, BurstConfig> = {
  classic: { flash: "radial", rings: 1, sparks: 14, sparkShape: "pill", motion: "out", sweep: false, scale: 1, flashDur: 0.95, ringDur: 0.75, sparkDur: 0.72, ease: "out" },
  snap: { flash: "radial", rings: 1, sparks: 10, sparkShape: "pill", motion: "out", sweep: false, scale: 0.82, flashDur: 0.5, ringDur: 0.42, sparkDur: 0.4, ease: "out" },
  bloom: { flash: "radial", rings: 1, sparks: 8, sparkShape: "dot", motion: "out", sweep: false, scale: 1.32, flashDur: 1.25, ringDur: 0.95, sparkDur: 0.9, ease: "out" },
  shockwave: { flash: "radial", rings: 3, sparks: 8, sparkShape: "streak", motion: "out", sweep: false, scale: 1.1, flashDur: 0.8, ringDur: 0.9, sparkDur: 0.62, ease: "out" },
  rays: { flash: "none", rings: 0, sparks: 24, sparkShape: "streak", motion: "out", sweep: false, scale: 1.16, flashDur: 0, ringDur: 0, sparkDur: 0.82, ease: "out" },
  twinkle: { flash: "none", rings: 0, sparks: 18, sparkShape: "star", motion: "out", sweep: false, scale: 1, flashDur: 0, ringDur: 0, sparkDur: 1.15, ease: "linear" },
  pinwheel: { flash: "radial", rings: 0, sparks: 16, sparkShape: "streak", motion: "spin", sweep: false, scale: 1.1, flashDur: 0.8, ringDur: 0, sparkDur: 0.9, ease: "out" },
  fountain: { flash: "radial", rings: 0, sparks: 20, sparkShape: "pill", motion: "fountain", sweep: false, scale: 1, flashDur: 0.8, ringDur: 0, sparkDur: 0.95, ease: "out" },
  ripple: { flash: "none", rings: 3, sparks: 0, sparkShape: "pill", motion: "out", sweep: false, scale: 1.24, flashDur: 0, ringDur: 1.05, sparkDur: 0, ease: "out" },
  halo: { flash: "conic", rings: 1, sparks: 0, sparkShape: "pill", motion: "out", sweep: false, scale: 1.25, flashDur: 1.3, ringDur: 1.2, sparkDur: 0, ease: "linear" },
  starburst: { flash: "radial", rings: 0, sparks: 12, sparkShape: "star", motion: "out", sweep: false, scale: 0.95, flashDur: 0.6, ringDur: 0, sparkDur: 0.62, ease: "pop" },
  shimmer: { flash: "none", rings: 0, sparks: 0, sparkShape: "pill", motion: "out", sweep: true, scale: 1, flashDur: 0, ringDur: 0, sparkDur: 0.85, ease: "out" },
  pop: { flash: "radial", rings: 1, sparks: 12, sparkShape: "dot", motion: "out", sweep: false, scale: 1, flashDur: 0.6, ringDur: 0.5, sparkDur: 0.52, ease: "pop" },
  ember: { flash: "none", rings: 0, sparks: 22, sparkShape: "dot", motion: "drift", sweep: false, scale: 1, flashDur: 0, ringDur: 0, sparkDur: 1.6, ease: "linear" },
  sprinkle: { flash: "radial", rings: 1, sparks: 24, sparkShape: "dot", motion: "out", sweep: false, scale: 1.05, flashDur: 0.9, ringDur: 0.7, sparkDur: 0.8, ease: "out" },
};

/** One spark's throw: an angle, how far it reaches, its launch lag, colour tint and drift. */
export type Spark = {
  angle: number;
  reach: number;
  delay: number;
  tint: number;
  /** Horizontal sway in px for the `drift` motion; 0 otherwise. */
  drift: number;
};

/**
 * Lay out `count` sparks for a motion. `out`/`spin` fan them evenly about the circle with an
 * alternating reach so it never reads as a perfect ring; `fountain` and `drift` bias them into
 * an upward cone. Deterministic — the same count and motion always give the same picture.
 * @pure true
 */
export function sparkFan(count: number, motion: SparkMotion): Spark[] {
  const out: Spark[] = [];
  for (let i = 0; i < count; i += 1) {
    const tint = i % 3;
    if (motion === "fountain" || motion === "drift") {
      // An upward cone (CSS rotate: 0° points right, negative sweeps up). The middle reaches
      // furthest for a fountain; drift keeps it low and even so the embers hover.
      const t = count > 1 ? i / (count - 1) : 0.5;
      const angle = -150 + t * 120;
      const centreWeight = 1 - Math.abs(t - 0.5) * 2;
      const reach = motion === "fountain" ? 0.5 + 0.65 * centreWeight : 0.45 + 0.35 * centreWeight;
      const delay = (i % 6) * 0.03;
      const drift = motion === "drift" ? (i % 2 ? 1 : -1) * (10 + (i % 3) * 8) : 0;
      out.push({ angle, reach, delay, tint, drift });
    } else {
      const angle = (360 / count) * i + (i % 2 ? 6 : -6);
      const reach = i % 3 === 0 ? 1 : i % 3 === 1 ? 0.78 : 0.6;
      const delay = (i % 4) * 0.018;
      out.push({ angle, reach, delay, tint, drift: 0 });
    }
  }
  return out;
}
