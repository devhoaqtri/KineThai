/**
 * Wide-card geometry, mirrored from vocabulary.css so the fit pipeline sizes and places
 * text against the room the stylesheet actually gives it.
 *
 * On a card wider than it is tall the stylesheet derives every band from the same few
 * numbers: the toolbar head above, the bottom chrome stack below (fixed in portrait,
 * 15% of the shell height on a short viewport), and a clearance between the two. The
 * answer word's band and the clue pages' band are both STRETCHED by the fit solver's
 * own reserved margins (72px above, 132px below), so that the area the solver will
 * place text in lands exactly on the free height. Two things in JS have to agree with
 * that geometry and used to restate it as guesses:
 *   - where the answer word sits in its band (`revealY`, a percentage of the band); the
 *     margins are asymmetric, so the middle of the usable area is NOT 50% of the band;
 *   - how much height a clue page is budgeted (`getVocabularyTextHeightBudget`).
 * Both are derived here instead. `npm run check:landscape` reads the stylesheet and
 * fails if any number below stops matching it.
 *
 * Not mirrored: `env(safe-area-inset-bottom)`. In the short tier it is absorbed by the
 * gap (the chrome's top edge stays on the band); only the tall-landscape portrait stack
 * grows by it, where the fit solver's own shrink covers the few pixels of difference.
 *
 * Exports: SHORT_VIEWPORT_MAX_H, COMPACT_VIEWPORT_MAX_H, LANDSCAPE_GEOMETRY,
 *          isShortViewport, getFeedChromeTop, getRevealFoot, getWideFreeHeight,
 *          getClueBandStretch, getWideRevealY
 * Depends on: post-player playback-timing (the fit solver's safe insets)
 */
import {
  TEXT_SAFE_BOTTOM_PX,
  TEXT_SAFE_TOP_PX,
  getTextSafeInsets,
} from "@/features/post-player/lib/playback-timing";

/**
 * Tallest shell that gets the compact chrome, the two-column answer page and the other
 * short-landscape treatments. The shell publishes `data-short-viewport` from its
 * MEASURED height against this (useShellHeightVar), so the stylesheet never restates it.
 */
export const SHORT_VIEWPORT_MAX_H = 560;
/** `@media (max-height: 620px)`: page label hidden, reveal clearances tightened. */
export const COMPACT_VIEWPORT_MAX_H = 620;

/** Every number the derivations below read, named after the CSS that owns it. */
export const LANDSCAPE_GEOMETRY = {
  /** `--vocab-reveal-head`: the toolbar's share of the top of a wide card. */
  head: 72,
  /** Portrait chrome stack: `--vocab-chrome-inset` + `-bar` + `-gap` + `-progress`. */
  portraitChromeTop: 44 + 44 + 40 + 3,
  /** Short tier `--vocab-chrome-band`: this share of the shell height ... */
  shortChromeRatio: 0.15,
  /** ... but never less than this. */
  shortChromeMin: 72,
  /** `--vocab-reveal-foot`, and its value under COMPACT_VIEWPORT_MAX_H. */
  foot: 30,
  compactFoot: 12,
  /** `--vocab-clue-foot`: a clue's clearance above the chrome, and under COMPACT_VIEWPORT_MAX_H. */
  clueFoot: 30,
  compactClueFoot: 24,
  /** Stacked answer page: `--vocab-reveal-word: max(136px, free * 0.5)`. */
  wordMin: 136,
  wordShare: 0.5,
} as const;

/** Whether a shell of this height takes the short-viewport tier. */
export function isShortViewport(height: number): boolean {
  return height > 0 && height <= SHORT_VIEWPORT_MAX_H;
}

/**
 * Distance from the card's bottom edge to the top of its bottom chrome.
 * @param height - card height, px (the card fills the measured shell)
 * @pure true
 */
export function getFeedChromeTop(height: number): number {
  const g = LANDSCAPE_GEOMETRY;
  // The short tier's gap absorbs whatever the inset, bar and progress row leave, so the
  // stack's top edge IS the band.
  return isShortViewport(height)
    ? Math.max(height * g.shortChromeRatio, g.shortChromeMin)
    : g.portraitChromeTop;
}

/** Clearance a wide card keeps between its text and the chrome below. @pure true */
export function getRevealFoot(height: number): number {
  return height <= COMPACT_VIEWPORT_MAX_H
    ? LANDSCAPE_GEOMETRY.compactFoot
    : LANDSCAPE_GEOMETRY.foot;
}

/**
 * Clearance a wide card keeps between a CLUE's last line and the chrome below. Wider than
 * the compact reveal foot, which lets the meaning panel reach the progress row: a clue's
 * ink hangs below its line box. @pure true
 */
export function getClueFoot(height: number): number {
  return height <= COMPACT_VIEWPORT_MAX_H
    ? LANDSCAPE_GEOMETRY.compactClueFoot
    : LANDSCAPE_GEOMETRY.clueFoot;
}

/** `--vocab-reveal-free`: the height between the toolbar and the chrome's clearance. @pure true */
export function getWideFreeHeight(height: number): number {
  return height - LANDSCAPE_GEOMETRY.head - getFeedChromeTop(height) - getRevealFoot(height);
}

/**
 * How far a wide card's clue band runs past the card's bottom edge (negative: stops short
 * of it), so that the solver's 132px bottom margin ends on the chrome's clearance rather
 * than 132px above the card edge. Mirrors the clue-band rule in the landscape tier.
 * @pure true
 */
export function getClueBandStretch(height: number): number {
  return TEXT_SAFE_BOTTOM_PX - getFeedChromeTop(height) - getClueFoot(height);
}

/**
 * Where the answer word's centre sits in its band on a wide card, as a percentage of the
 * band's height: the middle of the area the fit solver places text in, which is what the
 * celebration burst is aimed at too.
 * @param height - card height, px
 * @param twoColumn - the word has a full-height column instead of the top share
 * @pure true
 */
export function getWideRevealY(height: number, twoColumn: boolean): number {
  const g = LANDSCAPE_GEOMETRY;
  const free = getWideFreeHeight(height);
  const word = twoColumn ? free : Math.max(g.wordMin, free * g.wordShare);
  // The band opens TEXT_SAFE_TOP_PX above the word's share and closes TEXT_SAFE_BOTTOM_PX
  // below it (`top: head - 72px`, `bottom: 100% - head - word - 132px`).
  const band = TEXT_SAFE_TOP_PX + word + TEXT_SAFE_BOTTOM_PX;
  const insets = getTextSafeInsets(band);
  const centre = insets.top + (band - insets.top - insets.bottom) / 2;
  return Math.round((centre / band) * 1000) / 10;
}
