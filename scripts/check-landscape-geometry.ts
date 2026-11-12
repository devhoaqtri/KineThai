/**
 * Landscape geometry: lib/landscape-geometry.ts mirrors numbers that vocabulary.css owns,
 * and the card places the answer word with them. Fails when the two drift apart, when a
 * short-viewport media query restates the breakpoint the shell now publishes, or when
 * the derived answer centre stops landing where the celebration burst is aimed.
 * Run: npm run check:landscape
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  TEXT_SAFE_BOTTOM_PX,
  TEXT_SAFE_TOP_PX,
  getTextSafeInsets,
} from "../src/features/post-player/lib/playback-timing";
import {
  COMPACT_VIEWPORT_MAX_H,
  LANDSCAPE_GEOMETRY as G,
  SHORT_VIEWPORT_MAX_H,
  getClueBandStretch,
  getFeedChromeTop,
  getRevealFoot,
  getWideFreeHeight,
  getWideRevealY,
} from "../src/features/vocabulary/lib/landscape-geometry";
import { getVocabularyTextHeightBudget } from "../src/features/vocabulary/lib/presets";

const css = readFileSync(
  fileURLToPath(new URL("../src/features/vocabulary/vocabulary.css", import.meta.url)),
  "utf8",
);
const has = (needle: string, why: string) =>
  assert.ok(css.includes(needle), `${why}: expected \`${needle}\``);

// ── 1. Mirrored constants ──────────────────────────────────────────────────────
has("--vocab-chrome-inset: max(44px,", "portrait chrome inset");
has("--vocab-chrome-bar: 44px;", "portrait chrome bar");
has("--vocab-chrome-gap: 40px;", "portrait chrome gap");
has("--vocab-chrome-progress: 3px;", "chrome progress row");
assert.equal(G.portraitChromeTop, 44 + 44 + 40 + 3);
has(
  `--vocab-chrome-band: max(calc(var(--vocab-vh, 100dvh) * ${G.shortChromeRatio}), ${G.shortChromeMin}px);`,
  "short-tier chrome band",
);
has(`--vocab-reveal-head: ${G.head}px;`, "reveal head");
has(`--vocab-reveal-foot: ${G.foot}px;`, "reveal foot");
has(`--vocab-reveal-foot: ${G.compactFoot}px;`, "compact reveal foot");
has(`--vocab-clue-foot: ${G.clueFoot}px;`, "clue foot");
has(`--vocab-clue-foot: ${G.compactClueFoot}px;`, "compact clue foot");
has(
  `@media (orientation: landscape) and (max-height: ${COMPACT_VIEWPORT_MAX_H}px)`,
  "compact landscape tier",
);
has(
  `--vocab-reveal-word: max(${G.wordMin}px, calc(var(--vocab-reveal-free) * ${G.wordShare}));`,
  "stacked word share",
);
has(`top: calc(var(--vocab-reveal-head) - ${TEXT_SAFE_TOP_PX}px);`, "reveal band top stretch");
has(
  `bottom: calc(100% - var(--vocab-reveal-head) - var(--vocab-reveal-word) - ${TEXT_SAFE_BOTTOM_PX}px);`,
  "reveal band bottom stretch",
);
has(
  `bottom: calc(var(--vocab-chrome-top) + var(--vocab-clue-foot) - ${TEXT_SAFE_BOTTOM_PX}px);`,
  "clue band stretch",
);
has(".vocabulary-shell[data-short-viewport] {", "short-viewport chrome tier");
console.log("OK — mirrored constants match vocabulary.css");

// ── 2. No restated short-viewport breakpoint on card rules ─────────────────────
// Page layouts (the saved page's empty vault) still read the viewport; card geometry
// reads the shell's measured height.
const PAGE_LAYOUT = /^\s*\.(vocab-vault|vocab-saved-empty|vocab-saved-list)/;
const media = /@media[^{]*max-height:\s*(\d+)px[^{]*\{\s*([^{]+)\{/g;
for (const match of css.matchAll(media)) {
  const [, px, selector] = match;
  if (Number(px) !== SHORT_VIEWPORT_MAX_H) continue;
  assert.match(
    selector!,
    PAGE_LAYOUT,
    `a max-height: ${px}px media query styles \`${selector!.trim()}\`; key it on ` +
      `.vocabulary-shell[data-short-viewport] instead`,
  );
}
console.log("OK — card rules key on data-short-viewport, not a restated media query");

// ── 3. Derived placement across the device matrix ──────────────────────────────
const HEIGHTS = [320, 360, 390, 430, 480, 560, 561, 620, 621, 700, 768, 900];
for (const height of HEIGHTS) {
  const free = getWideFreeHeight(height);
  for (const twoColumn of height <= SHORT_VIEWPORT_MAX_H ? [true, false] : [false]) {
    const word = twoColumn ? free : Math.max(G.wordMin, free * G.wordShare);
    const band = TEXT_SAFE_TOP_PX + word + TEXT_SAFE_BOTTOM_PX;
    const wordCentre = (getWideRevealY(height, twoColumn) / 100) * band;
    // The band opens at `head - 72px`; the burst CSS aims at `head + word / 2`.
    const burstCentre = G.head + word / 2 - (G.head - TEXT_SAFE_TOP_PX);
    assert.ok(
      Math.abs(wordCentre - burstCentre) <= 1,
      `${height}px ${twoColumn ? "two-column" : "stacked"}: word centre ${wordCentre.toFixed(1)} ` +
        `vs burst ${burstCentre.toFixed(1)}`,
    );
  }
}
console.log(`OK — answer centre == burst centre at ${HEIGHTS.length} heights`);

// The reported regression: the two-column word sat 30px under its burst at 844×390.
assert.equal(getFeedChromeTop(390), 72);
assert.equal(getRevealFoot(390), 12);
assert.ok(Math.abs(getWideRevealY(390, true) - 43.2) < 0.15, `390px two-column revealY`);
console.log(`OK — 844×390 two-column revealY ${getWideRevealY(390, true)}% (was a fixed 50%)`);

// ── 4. Clue budget equals the band the solver is handed ────────────────────────
for (const height of HEIGHTS) {
  const width = Math.round(height * 2.16);
  const band = height + getClueBandStretch(height);
  const insets = getTextSafeInsets(band);
  const usable = band - insets.top - insets.bottom;
  const budget = getVocabularyTextHeightBudget(width, height);
  // The 320px portrait reservation still caps it, so a wide card never budgets less.
  const expected = Math.max(100, Math.max(height - 320, usable));
  assert.ok(
    Math.abs(budget - expected) < 1e-6,
    `${width}×${height} budget ${budget} vs ${expected}`,
  );
}
assert.equal(getVocabularyTextHeightBudget(844, 390), 222, "844×390 clue budget (24px clue clearance)");
// Portrait and export are byte-identical.
assert.equal(getVocabularyTextHeightBudget(390, 844), 844 - 320);
assert.equal(getVocabularyTextHeightBudget(844, 390, 0), 390);
console.log("OK — wide clue budget == solver band; portrait and export unchanged");

console.log("\nAll landscape geometry checks passed.");
