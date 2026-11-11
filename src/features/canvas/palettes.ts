/**
 * Harmonized palette collection.
 *
 * A palette binds five interdependent roles — a two-color backdrop, ink (body text),
 * two highlight accents, and the text color that sits on an accent fill — instead of
 * letting each be chosen independently. Every entry is checked against WCAG
 * contrast floors and separation floors, and `ensureReadablePalette` repairs a
 * stored palette that an operator hand-edited into an unreadable state, so a
 * conflicting combination can never reach the screen.
 *
 * The backdrop is deliberately two colors, not one shade: the second stop gives the
 * card depth and gives the per-page transition sweep somewhere visible to travel.
 *
 * Exports: Palette types, PALETTE_SCHEMES, PALETTE_THRESHOLDS, generatePalette,
 *          auditPalette, ensureReadablePalette, paletteSwatches, rgbToHex, hslHex,
 *          paletteBackgroundStops, paletteBackdropColors, VIETNAMESE_SAFE_FONTS,
 *          HANDWRITING_FONTS, PALETTE_FONTS, DEFAULT_PALETTE_FONT, isVietnameseCapableFont,
 *          isPaletteFont
 * Depends on: ./contrast/color-math
 *
 * This module is intentionally free of data imports so `scripts/check-palette-contrast.ts`
 * can run it under bare Node type-stripping. That is also why the color-math
 * specifier carries an explicit `.ts` extension: Node ESM will not resolve an
 * extensionless relative import, and color-math is itself a leaf module. The
 * seeded collection lives in ./palette-collection.
 */

import {
  clamp,
  extractCssColors,
  getColorDistance,
  getContrastRatio,
  getHueDistance,
  getRelativeLuminance,
  hslToRgb,
  isTooDarkBackground,
  parseCssColor,
  rgbToHsl,
  type RgbColor,
} from "./contrast/color-math.ts";

export type PaletteScheme = "analogous" | "complementary" | "split" | "triadic";
export type PaletteTone = "dark" | "light";

export type Palette = {
  id: string;
  label: string;
  /** One-line description shown in pickers and the admin list. */
  mood: string;
  scheme: PaletteScheme;
  tone: PaletteTone;
  /** Base hue in degrees; the whole palette is derived from it. */
  hue: number;
  /**
   * CSS background-image value: the two-tone backdrop gradient. Its stops are read
   * back with `paletteBackdropColors` wherever a single color is needed.
   */
  background: string;
  /** Body text color. */
  ink: string;
  /** Primary highlight — emphasized words, active controls. */
  accentA: string;
  /** Secondary highlight — progress, secondary emphasis, dividers. */
  accentB: string;
  /** Text color placed on top of an accentA/accentB fill. */
  onAccent: string;
  font: string;
};

export type PaletteCheckUnit = "contrast" | "distance" | "hue" | "boolean";

export type PaletteCheck = {
  id: string;
  label: string;
  value: number;
  required: number;
  unit: PaletteCheckUnit;
  pass: boolean;
};

export type PaletteAudit = {
  checks: PaletteCheck[];
  pass: boolean;
  /** Lowest measured contrast ratio, for sorting/surfacing the worst offenders. */
  worstContrast: number;
};

/**
 * Floors a palette must clear, following WCAG 2.1.
 *
 * Both accents are held to 3:1 — the large-text and graphical-object floor —
 * because that is what they are used for: emphasized words (large and bold),
 * progress bars, pill fills, dividers and glows. Pushing an accent to the 4.5:1
 * body-text floor is self-defeating on a dark palette: the only colors that clear
 * it are so pale that they collapse into the near-white ink and stop reading as a
 * highlight. Small text must therefore be painted with `ink`, never an accent.
 *
 * Separation floors keep an accent from collapsing into the body text or into the
 * other accent.
 */
export const PALETTE_THRESHOLDS = {
  inkOnBackground: 4.5,
  accentOnBackground: 3,
  onAccentOnAccent: 4.5,
  accentFromInkDistance: 60,
  accentPairDistance: 60,
  accentPairHue: 20,
  /**
   * Minimum hue separation between the two backdrop stops. Below this the gradient
   * reads as one flat shade, which is the failure this floor exists to prevent: a
   * backdrop that is only darker/lighter than itself has no second color.
   */
  backdropPairHue: 60,
} as const;

export const PALETTE_SCHEMES: readonly PaletteScheme[] = [
  "analogous",
  "complementary",
  "split",
  "triadic",
];

/**
 * The only fonts a palette may name. Every entry ships a Vietnamese (Latin
 * Extended + diacritics) Unicode subset, because the vocabulary feed paints
 * Vietnamese clue and definition text in the theme's own font — a family without
 * those glyphs renders broken accent characters. This list is the single source of
 * truth: `catalog.FONTS` offers it to pickers, `normalizePalette` refuses anything
 * outside it, and the admin save endpoint rejects it, so an unsupported font can
 * neither be chosen nor reach the screen.
 */
/**
 * Handwriting faces, all with a real bold cut so the canvas's 800/900 weights do not
 * fall back to synthetic bold. Caveat, Kalam and Comic Neue were rejected: no
 * Vietnamese subset.
 */
export const HANDWRITING_FONTS = [
  "Dancing Script",
  "Playpen Sans",
  "Shantell Sans",
  "Charm",
] as const;

export const VIETNAMESE_SAFE_FONTS = [
  "Inter",
  "Space Grotesk",
  "Playfair Display",
  "JetBrains Mono",
  ...HANDWRITING_FONTS,
] as const;

/**
 * The faces a palette (so a feed card) may name: the safe list without JetBrains Mono.
 * A monospace cell has to squeeze `m` and shorten its middle leg, which reads as a broken
 * letter in large kinetic Vietnamese ("mười", "mình"), so the feed never paints in it.
 * Create Studio keeps it through catalog.FONTS.
 */
export const PALETTE_FONTS = [
  "Inter",
  "Space Grotesk",
  "Playfair Display",
  ...HANDWRITING_FONTS,
] as const;

/** A palette's default face, used when none is stored or a stored one is unsupported. */
export const DEFAULT_PALETTE_FONT: string = PALETTE_FONTS[1];

/**
 * Whether a font family carries the Vietnamese subset the feed needs. Unknown or
 * accent-less families (e.g. Bebas Neue) return false so they can be healed away.
 * @pure true
 */
export function isVietnameseCapableFont(font: string | null | undefined): boolean {
  if (!font) return false;
  return (VIETNAMESE_SAFE_FONTS as readonly string[]).includes(font.trim());
}

/**
 * Whether a palette may name this font (PALETTE_FONTS). A face outside it, monospace
 * included, is healed to DEFAULT_PALETTE_FONT when a palette loads.
 * @pure true
 */
export function isPaletteFont(font: string | null | undefined): boolean {
  if (!font) return false;
  return (PALETTE_FONTS as readonly string[]).includes(font.trim());
}

/**
 * Hue offsets for the two accents, per scheme. Pairs are kept at least 60 degrees
 * apart so the two highlights stay distinguishable, and both sit well outside the
 * background's own hue band (base to base+24) so they read as highlights.
 */
const SCHEME_ACCENT_OFFSETS: Record<PaletteScheme, readonly [number, number]> = {
  analogous: [50, -55],
  complementary: [165, 75],
  split: [150, 210],
  triadic: [120, 240],
};

/**
 * Hue offsets offered to the backdrop's second stop, most harmonious first: the
 * near-complement end of the wheel is tried before the wide triadic shifts, and the
 * 75° end last because a pair that close starts reading as one family again. Nothing
 * closer is offered — hex rounding moves a hue a degree or two, so a candidate sitting
 * exactly on `backdropPairHue` could land just under the floor it was meant to clear.
 */
const BACKDROP_SECOND_HUE_CANDIDATES = [
  180, 165, 195, 150, 210, 135, 225, 120, 240, 105, 255, 90, 270, 75, 285,
] as const;

const LIGHTNESS_STEP = 0.02;
/** Lightness increments used when hunting a target luminance. */
const LUMINANCE_STEP = 0.005;
/** Degrees the secondary backdrop stop is rotated per attempt when spreading a flat pair. */
const BACKDROP_HUE_STEP = 10;
/** How far a too-dark backdrop may be lifted, in LIGHTNESS_STEP increments. */
const BACKGROUND_LIFT_STEPS = 14;
/** The two label colors tried for text sitting on an accent fill. */
const NEAR_BLACK = "#14101f";
const NEAR_WHITE = "#ffffff";

/** Convert an RGB triple to a lowercase #rrggbb string. @pure true */
export function rgbToHex({ r, g, b }: RgbColor): string {
  const channel = (value: number) =>
    Math.round(clamp(value, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Build a hex color from HSL components (h in degrees, s/l in 0-1). @pure true */
export function hslHex(h: number, s: number, l: number): string {
  return rgbToHex(hslToRgb({ h, s: clamp(s, 0, 1), l: clamp(l, 0, 1) }));
}

/**
 * Parse every color stop of a palette background so contrast is measured against
 * the worst stop, not an average — a gradient's pale end is what hides text.
 * @pure true
 */
export function paletteBackgroundStops(background: string): RgbColor[] {
  const parsed = extractCssColors(background).map(parseCssColor).filter(Boolean);
  return parsed as RgbColor[];
}

/**
 * The two colors a palette paints its backdrop with, as hex: primary first, then
 * the secondary that keeps the gradient from reading as one flat shade. A backdrop
 * stored with a single color (or more than two stops) still resolves: the missing
 * secondary repeats the primary, which is exactly what makes the audit's
 * `backdrop-two-tone` check fail.
 * @param background - CSS gradient or color
 * @returns [primary, secondary] hex stops
 * @pure true
 */
export function paletteBackdropColors(background: string): [string, string] {
  const stops = paletteBackgroundStops(background).map(rgbToHex);
  const first = stops[0] ?? "#1e143e";
  return [first, stops[stops.length - 1] ?? first];
}

/**
 * Give the backdrop a real second color: rotate the second stop away from the first
 * until the pair reads as two colors, or compose a second stop when the backdrop was
 * stored as a single flat color. Both repairs keep the stop's own saturation and
 * lightness, so the palette's tone and mood survive and only the flaw changes.
 *
 * The mirror of `liftBackgroundUntilPaintable`: a near-black backdrop is discarded by
 * the canvas pipeline, while a one-shade backdrop is accepted and simply looks flat —
 * and a bare color is not a valid `background-image` at all, so it gets substituted
 * too. A backdrop that already clears the floor is returned untouched.
 * @param background - CSS gradient or color
 * @returns The same backdrop with two stops that are measurably different colors
 * @pure true
 */
function spreadBackdropUntilTwoTone(background: string): string {
  // Substitution has to target the tokens as they are WRITTEN in the gradient: an
  // uppercase hex or an rgb() call would never match a normalized hex, and a
  // replacement that silently misses leaves the flat backdrop exactly as it was.
  const tokens = extractCssColors(background);
  const from = parseCssColor(tokens[0]);
  // An unparseable first token means this is not a color backdrop at all (a photo
  // layer, a pattern stack), and there is no hue to rotate.
  if (!from) return background;
  const hslFrom = rgbToHsl(from);

  // One color only: build the second stop across the wheel from it, slightly quieter
  // so the pair still reads as one backdrop rather than two competing fields.
  if (tokens.length === 1) {
    const second = hslHex(hslFrom.h + 135, hslFrom.s * 0.9, hslFrom.l);
    return `linear-gradient(135deg,${tokens[0]},${second})`;
  }

  const last = tokens.length - 1;
  const to = parseCssColor(tokens[last]);
  if (!to) return background;
  const hslTo = rgbToHsl(to);
  if (getHueDistance(hslFrom.h, hslTo.h) >= PALETTE_THRESHOLDS.backdropPairHue) return background;

  // Walk the secondary around the wheel in the direction it was already leaning, so
  // a hand-made backdrop keeps its intended mood instead of jumping sides.
  const direction = hslTo.h >= hslFrom.h ? 1 : -1;
  for (let spread = BACKDROP_HUE_STEP; spread <= 180; spread += BACKDROP_HUE_STEP) {
    const rotated = hslHex(hslTo.h + direction * spread, hslTo.s, hslTo.l);
    const rotatedHue = rgbToHsl(parseCssColor(rotated)!).h;
    if (getHueDistance(hslFrom.h, rotatedHue) >= PALETTE_THRESHOLDS.backdropPairHue) {
      return substituteStops(background, [tokens[0], tokens[last]], [tokens[0], rotated]);
    }
  }
  return background;
}

/**
 * Lift every stop's lightness until the backdrop is paintable, preserving the
 * gradient's own structure (angle, stop count, positions).
 *
 * This is not cosmetic: the canvas backdrop pipeline discards near-black stops and
 * silently substitutes its own default gradient, so a palette dark enough to trip
 * that rule would be painted in colors that are not in the palette at all. Lifting
 * stops at the first paintable value, so a backdrop that is already fine is
 * returned untouched and light palettes never change.
 * @param background Any CSS gradient or color
 * @returns The same backdrop with lightness raised only as far as needed
 * @pure true
 */
export function liftBackgroundUntilPaintable(background: string): string {
  const tokens = extractCssColors(background);
  const parsed = tokens.map(parseCssColor);
  if (!tokens.length || parsed.some((color) => color === null)) return background;
  const hsls = (parsed as RgbColor[]).map(rgbToHsl);

  for (let lift = 0; lift <= BACKGROUND_LIFT_STEPS; lift++) {
    const hexes = hsls.map((hsl) =>
      rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l: clamp(hsl.l + lift * LIGHTNESS_STEP, 0, 1) })),
    );
    const lifted = hexes.map((hex) => parseCssColor(hex)).filter(Boolean) as RgbColor[];
    if (!isTooDarkBackground(lifted)) return substituteStops(background, tokens, hexes);
  }
  return background;
}

/** Replace each extracted color token, in order, with its lifted replacement. */
function substituteStops(background: string, tokens: string[], hexes: string[]): string {
  let out = background;
  tokens.forEach((token, index) => {
    out = out.replace(token, hexes[index] ?? token);
  });
  return out;
}

/**
 * Compose the two-tone backdrop a generated palette is built on.
 *
 * Both stops are placed by relative LUMINANCE, not HSL lightness: a violet and a
 * green at the same L are nowhere near equally bright, so a fixed lightness made the
 * green half of the backdrop wash out to a mid-tone the body text could not sit on.
 * Solving in luminance keeps the pair inside the tone's band — deep and saturated for
 * a dark palette, bright for a light one — so adding the second color cannot move the
 * contrast floors the ink and accents are solved against.
 *
 * The dark band is kept low on purpose: an accent has to clear 3:1 against the
 * LIGHTER stop, so a mid-tone second stop forces every accent up into pastel. Holding
 * that stop near 0.09 lets the accents land around 75% lightness, where magenta,
 * coral and violet still have their full chroma. The first stop stays just above the
 * canvas pipeline's too-dark floor (0.05), so nothing here can read as black.
 * @pure true
 */
function composeBackground(hue: number, dark: boolean, secondOffset: number): string {
  const stopOne = hslHexAtLuminance(hue, dark ? 0.72 : 0.9, dark ? 0.055 : 0.8);
  const stopTwo = hslHexAtLuminance(hue + secondOffset, dark ? 0.7 : 0.82, dark ? 0.09 : 0.66);
  return `linear-gradient(135deg,${stopOne},${stopTwo})`;
}

/**
 * Build a color of the given hue and saturation whose relative luminance is as close
 * to `target` as the lightness can bring it, walking up from black so an unreachable
 * target settles on the nearest darker step instead of overshooting.
 * @pure true
 */
function hslHexAtLuminance(h: number, s: number, target: number): string {
  let previous = hslHex(h, s, 0);
  for (let l = LUMINANCE_STEP; l <= 1; l += LUMINANCE_STEP) {
    const candidate = hslHex(h, s, l);
    const rgb = parseCssColor(candidate);
    if (!rgb) return previous;
    if (getRelativeLuminance(rgb) >= target) return candidate;
    previous = candidate;
  }
  return previous;
}

function contrastAgainst(color: string, stops: RgbColor[]): number {
  const rgb = parseCssColor(color);
  if (!rgb || !stops.length) return 0;
  return Math.min(...stops.map((stop) => getContrastRatio(rgb, stop)));
}

/**
 * Pick the hue offset for the backdrop's second stop: the candidate that sits
 * farthest from BOTH accents, so the new color deepens the backdrop without borrowing
 * a highlight's identity. Ties resolve to whichever candidate is listed first, which
 * is how a scheme whose accents already wrap the wheel still gets a deliberate choice
 * instead of an arbitrary one.
 * @pure true
 */
function backdropSecondHue(offsets: readonly [number, number]): number {
  let chosen: number = BACKDROP_SECOND_HUE_CANDIDATES[0];
  let chosenClearance = Number.NEGATIVE_INFINITY;
  for (const offset of BACKDROP_SECOND_HUE_CANDIDATES) {
    const clearance = Math.min(
      getHueDistance(offset, offsets[0]),
      getHueDistance(offset, offsets[1]),
    );
    if (clearance > chosenClearance) {
      chosenClearance = clearance;
      chosen = offset;
    }
  }
  return chosen;
}

function distanceFrom(color: string, other: string): number {
  const a = parseCssColor(color);
  const b = parseCssColor(other);
  return a && b ? getColorDistance(a, b) : 0;
}

/**
 * Walk an HSL lightness from `from` toward `to` and return the first color that
 * satisfies `passes`. When nothing on the path qualifies, return the candidate
 * with the best `score` so the result degrades gracefully instead of throwing.
 * @pure true
 */
function solveLightness(opts: {
  hue: number;
  saturation: number;
  from: number;
  to: number;
  passes: (hex: string) => boolean;
  score: (hex: string) => number;
}): string {
  const { hue, saturation, from, to, passes, score } = opts;
  const direction = to >= from ? 1 : -1;
  let bestHex = hslHex(hue, saturation, from);
  let bestScore = score(bestHex);
  for (let l = from; direction > 0 ? l <= to : l >= to; l += direction * LIGHTNESS_STEP) {
    const candidate = hslHex(hue, saturation, l);
    if (passes(candidate)) return candidate;
    const candidateScore = score(candidate);
    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      bestHex = candidate;
    }
  }
  return bestHex;
}

/**
 * Derive a complete, mutually legible palette from one base hue and a color
 * scheme. Deterministic: the same input always yields the same hex values, so a
 * generated palette can be stored, diffed and audited later.
 * @param input - base hue, scheme, tone and identity fields
 * @returns A palette that satisfies `auditPalette`
 * @pure true
 */
export function generatePalette(input: {
  id: string;
  label: string;
  mood?: string;
  hue: number;
  scheme?: PaletteScheme;
  tone?: PaletteTone;
  font?: string;
}): Palette {
  const scheme = input.scheme ?? "analogous";
  const tone = input.tone ?? "dark";
  const hue = ((input.hue % 360) + 360) % 360;
  const dark = tone === "dark";
  const [offsetA, offsetB] = SCHEME_ACCENT_OFFSETS[scheme];

  // The backdrop takes the base hue plus a second color placed as far from both
  // accents as the scheme allows: one hue family painted at two lightnesses reads as
  // a flat shade, and the accents must stay the only things that pull the eye. The
  // result is then lifted only if the canvas pipeline would refuse it as too dark.
  const background = liftBackgroundUntilPaintable(
    composeBackground(hue, dark, backdropSecondHue([offsetA, offsetB])),
  );
  const stops = paletteBackgroundStops(background);

  const ink = solveLightness({
    hue: hue + 24,
    saturation: dark ? 0.18 : 0.42,
    from: dark ? 0.98 : 0.13,
    to: dark ? 1 : 0,
    passes: (hex) => contrastAgainst(hex, stops) >= PALETTE_THRESHOLDS.inkOnBackground,
    score: (hex) => contrastAgainst(hex, stops),
  });

  const accentStart = dark ? 0.66 : 0.44;
  const accentTarget = dark ? 0.94 : 0.16;
  // The polarity of text on an accent fill follows from the tone: dark palettes
  // solve their accents upward (bright, so a near-black label clears 4.5:1) and
  // light palettes solve downward (deep, so a white label does). Fixing it here
  // turns "label on accent" into a constraint the solver can satisfy instead of a
  // value discovered afterwards that may clear neither polarity.
  const onAccent = dark ? NEAR_BLACK : NEAR_WHITE;
  const legibleOnAccent = (hex: string) =>
    contrastPair(hex, onAccent) >= PALETTE_THRESHOLDS.onAccentOnAccent;

  const accentA = solveLightness({
    hue: hue + offsetA,
    saturation: dark ? 0.96 : 0.86,
    from: accentStart,
    to: accentTarget,
    passes: (hex) =>
      contrastAgainst(hex, stops) >= PALETTE_THRESHOLDS.accentOnBackground &&
      distanceFrom(hex, ink) >= PALETTE_THRESHOLDS.accentFromInkDistance &&
      legibleOnAccent(hex),
    score: (hex) => contrastAgainst(hex, stops),
  });
  // The second accent carries the separation floors too, so the pair can never
  // converge into two shades of the same color.
  const accentB = solveLightness({
    hue: hue + offsetB,
    saturation: dark ? 0.96 : 0.86,
    from: accentStart,
    to: accentTarget,
    passes: (hex) =>
      contrastAgainst(hex, stops) >= PALETTE_THRESHOLDS.accentOnBackground &&
      distanceFrom(hex, ink) >= PALETTE_THRESHOLDS.accentFromInkDistance &&
      legibleOnAccent(hex) &&
      distanceFrom(hex, accentA) >= PALETTE_THRESHOLDS.accentPairDistance &&
      hueDistanceBetween(hex, accentA) >= PALETTE_THRESHOLDS.accentPairHue,
    score: (hex) => contrastAgainst(hex, stops),
  });

  return {
    id: input.id,
    label: input.label,
    mood: input.mood ?? `${scheme} pair on a ${tone} ${Math.round(hue)}° base`,
    scheme,
    tone,
    hue: Math.round(hue),
    background,
    ink,
    accentA,
    accentB,
    onAccent,
    font: isPaletteFont(input.font) ? input.font!.trim() : DEFAULT_PALETTE_FONT,
  };
}

/** Pick black or white for text on an accent fill, whichever clears 4.5:1. @pure true */
function resolveOnAccent(accentA: string, accentB: string): string {
  const candidates = [NEAR_BLACK, NEAR_WHITE];
  const scored = candidates.map((candidate) => ({
    candidate,
    ratio: Math.min(contrastPair(candidate, accentA), contrastPair(candidate, accentB)),
  }));
  scored.sort((a, b) => b.ratio - a.ratio);
  return scored[0]?.candidate ?? NEAR_WHITE;
}

function contrastPair(a: string, b: string): number {
  const rgbA = parseCssColor(a);
  const rgbB = parseCssColor(b);
  return rgbA && rgbB ? getContrastRatio(rgbA, rgbB) : 0;
}

/**
 * Audit a palette against every legibility floor. Reported per check so the admin
 * page can show exactly which pair fails and by how much.
 * @param palette - the palette to measure
 * @returns Every check plus an overall pass flag
 * @pure true
 */
export function auditPalette(palette: Palette): PaletteAudit {
  const stops = paletteBackgroundStops(palette.background);
  const [backdropPrimary, backdropSecondary] = paletteBackdropColors(palette.background);
  const inkContrast = contrastAgainst(palette.ink, stops);
  const accentAContrast = contrastAgainst(palette.accentA, stops);
  const accentBContrast = contrastAgainst(palette.accentB, stops);
  const pairHue = hueDistanceBetween(palette.accentA, palette.accentB);
  const checks: PaletteCheck[] = [
    // A backdrop the canvas pipeline refuses would be replaced by its own default
    // gradient, so the palette would not actually be what renders.
    check(
      "background-paintable",
      "Background paintable by the canvas pipeline",
      isTooDarkBackground(stops) ? 0 : 1,
      1,
      "boolean",
    ),
    // Two stops of the same hue are one color at two lightnesses: the backdrop loses
    // its second color and the page sweep has nowhere visible to travel.
    check(
      "backdrop-two-tone",
      "Backdrop carries two distinct colors",
      hueDistanceBetween(backdropPrimary, backdropSecondary),
      PALETTE_THRESHOLDS.backdropPairHue,
      "hue",
    ),
    check(
      "ink-background",
      "Text on background",
      inkContrast,
      PALETTE_THRESHOLDS.inkOnBackground,
      "contrast",
    ),
    check(
      "accent-a-background",
      "Accent A on background",
      accentAContrast,
      PALETTE_THRESHOLDS.accentOnBackground,
      "contrast",
    ),
    check(
      "accent-b-background",
      "Accent B on background",
      accentBContrast,
      PALETTE_THRESHOLDS.accentOnBackground,
      "contrast",
    ),
    check(
      "on-accent-a",
      "Label on accent A",
      contrastPair(palette.onAccent, palette.accentA),
      PALETTE_THRESHOLDS.onAccentOnAccent,
      "contrast",
    ),
    check(
      "on-accent-b",
      "Label on accent B",
      contrastPair(palette.onAccent, palette.accentB),
      PALETTE_THRESHOLDS.onAccentOnAccent,
      "contrast",
    ),
    check(
      "accent-a-ink",
      "Accent A apart from text",
      distanceFrom(palette.accentA, palette.ink),
      PALETTE_THRESHOLDS.accentFromInkDistance,
      "distance",
    ),
    check(
      "accent-b-ink",
      "Accent B apart from text",
      distanceFrom(palette.accentB, palette.ink),
      PALETTE_THRESHOLDS.accentFromInkDistance,
      "distance",
    ),
    check(
      "accent-pair-distance",
      "Accents apart from each other",
      distanceFrom(palette.accentA, palette.accentB),
      PALETTE_THRESHOLDS.accentPairDistance,
      "distance",
    ),
    check(
      "accent-pair-hue",
      "Accents differ in hue",
      pairHue,
      PALETTE_THRESHOLDS.accentPairHue,
      "hue",
    ),
  ];
  return {
    checks,
    pass: checks.every((entry) => entry.pass),
    worstContrast: Math.min(inkContrast, accentAContrast, accentBContrast),
  };
}

function check(
  id: string,
  label: string,
  value: number,
  required: number,
  unit: PaletteCheckUnit,
): PaletteCheck {
  return { id, label, value, required, unit, pass: value >= required };
}

/**
 * Render one failing check as a sentence an operator can act on. Shared by the
 * admin page, the save-time rejection message and the check script so the same
 * failure reads the same everywhere.
 * @param check - a failing audit entry
 * @pure true
 */
export function describePaletteCheck(check: PaletteCheck): string {
  if (check.unit === "boolean") {
    return `${check.label}: backdrop is too dark, so the canvas pipeline substitutes its own default gradient`;
  }
  const unit = check.unit === "contrast" ? ":1" : check.unit === "hue" ? "°" : "";
  return `${check.label}: measured ${check.value.toFixed(2)}${unit}, needs at least ${check.required}${unit}`;
}

function hueDistanceBetween(a: string, b: string): number {
  const rgbA = parseCssColor(a);
  const rgbB = parseCssColor(b);
  if (!rgbA || !rgbB) return 0;
  return getHueDistance(rgbToHsl(rgbA).h, rgbToHsl(rgbB).h);
}

/**
 * Repair a stored palette that fails its audit, preserving the operator's
 * background and hue intent. Only the roles that actually fail are moved, and
 * only along their own hue so the palette keeps its identity.
 * @param palette - possibly hand-edited palette
 * @returns A palette that passes `auditPalette` whenever one is reachable
 * @pure true
 */
export function ensureReadablePalette(palette: Palette): Palette {
  const next: Palette = { ...palette };
  // Spread first: a one-shade backdrop is accepted by every other rule, so the second
  // color has to be restored before anything is measured against it.
  // Then lift: a too-dark backdrop is discarded wholesale by the canvas pipeline,
  // so every contrast measurement below has to be taken against the lifted result.
  next.background = liftBackgroundUntilPaintable(spreadBackdropUntilTwoTone(palette.background));
  const stops = paletteBackgroundStops(next.background);
  if (!stops.length) return next;

  next.ink = repairRole(next.ink, stops, {
    required: PALETTE_THRESHOLDS.inkOnBackground,
    extra: () => true,
  });
  next.accentA = repairRole(next.accentA, stops, {
    required: PALETTE_THRESHOLDS.accentOnBackground,
    extra: (hex) => distanceFrom(hex, next.ink) >= PALETTE_THRESHOLDS.accentFromInkDistance,
  });
  next.accentB = repairRole(next.accentB, stops, {
    required: PALETTE_THRESHOLDS.accentOnBackground,
    extra: (hex) =>
      distanceFrom(hex, next.ink) >= PALETTE_THRESHOLDS.accentFromInkDistance &&
      distanceFrom(hex, next.accentA) >= PALETTE_THRESHOLDS.accentPairDistance &&
      hueDistanceBetween(hex, next.accentA) >= PALETTE_THRESHOLDS.accentPairHue,
  });

  // Two accents that landed on the same hue cannot be told apart no matter how
  // their lightness moves, so rotate B away from A before re-solving it.
  if (hueDistanceBetween(next.accentA, next.accentB) < PALETTE_THRESHOLDS.accentPairHue) {
    const hslA = rgbToHsl(parseCssColor(next.accentA) ?? { r: 255, g: 255, b: 255 });
    const rotated = hslA.h + 48;
    next.accentB = solveLightness({
      hue: rotated,
      saturation: Math.max(rgbToHsl(parseCssColor(next.accentB) ?? { r: 0, g: 0, b: 0 }).s, 0.6),
      from: 0.6,
      to: 0.94,
      passes: (hex) =>
        contrastAgainst(hex, stops) >= PALETTE_THRESHOLDS.accentOnBackground &&
        distanceFrom(hex, next.ink) >= PALETTE_THRESHOLDS.accentFromInkDistance,
      score: (hex) => contrastAgainst(hex, stops),
    });
  }

  next.onAccent = resolveOnAccent(next.accentA, next.accentB);
  return next;
}

/** Re-solve one color's lightness along its own hue until its floors are met. */
function repairRole(
  color: string,
  stops: RgbColor[],
  opts: { required: number; extra: (hex: string) => boolean },
): string {
  const rgb = parseCssColor(color);
  if (!rgb) return color;
  const qualifies = (hex: string) =>
    contrastAgainst(hex, stops) >= opts.required && opts.extra(hex);
  if (qualifies(color)) return color;

  const hsl = rgbToHsl(rgb);
  // Move toward whichever end of the lightness range increases contrast with the
  // background: brighten on dark backdrops, darken on light ones.
  const towardLight = contrastAgainst("#ffffff", stops) >= contrastAgainst("#000000", stops);
  return solveLightness({
    hue: hsl.h,
    saturation: hsl.s,
    from: hsl.l,
    to: towardLight ? 1 : 0,
    passes: qualifies,
    score: (hex) => contrastAgainst(hex, stops),
  });
}

/**
 * Coerce a raw JSON row into a Palette, filling anything an older file lacks.
 * @param raw - untrusted row from the seeded/admin-edited collection
 * @returns A structurally complete palette (not yet contrast-repaired)
 * @pure true
 */
export function normalizePalette(raw: Palette): Palette {
  return {
    ...raw,
    mood: raw.mood ?? "",
    scheme: raw.scheme ?? "analogous",
    tone: raw.tone ?? "dark",
    hue: Number.isFinite(raw.hue) ? raw.hue : 0,
    // Heal any font outside the Vietnamese-capable allowlist (a hand-edited or stale
    // row naming, say, Bebas Neue) so the feed never paints broken diacritics.
    font: isPaletteFont(raw.font) ? raw.font!.trim() : DEFAULT_PALETTE_FONT,
  };
}

/**
 * Flattened swatch list for color pickers that offer single colors rather than
 * whole palettes. Ordered so each palette contributes its roles together, and
 * de-duplicated perceptually rather than by hex: every palette tints its ink
 * slightly differently, and a picker showing ten near-identical whites is noise.
 * @param palettes - the collection to flatten
 * @pure true
 */
export function paletteSwatches(palettes: readonly Palette[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const palette of palettes) {
    for (const color of [palette.ink, palette.accentA, palette.accentB, palette.onAccent]) {
      const key = swatchKey(color);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(color);
    }
  }
  return out;
}

/**
 * Bucket a color for de-duplication. Hue is dropped for desaturated colors,
 * because hue is perceptually meaningless near white/black and would otherwise
 * keep every tinted ink distinct.
 * @pure true
 */
function swatchKey(color: string): string {
  const rgb = parseCssColor(color);
  if (!rgb) return color.toLowerCase();
  const { h, s, l } = rgbToHsl(rgb);
  const hue = s < 0.25 ? 0 : Math.round(h / 12);
  return `${hue}:${Math.round(s * 10)}:${Math.round(l * 8)}`;
}
