/**
 * What a renderer may rely on when driving /carousel/$code.
 *
 * The sibling of EXPORT_CONTRACT, for still images. A leaf module on purpose, so a script
 * can read it without pulling in the card. scripts/check-carousel-frame.ts holds it in place.
 *
 * On `<body>`:
 *   data-slide-phase    "loading" | "settling" | "settled" | "failed" | "missing"
 *   data-slide-index    which slide this page is drawing
 *   data-slide-count    how many slides the word has
 *   data-slide-word     the headword, once resolved
 *   data-slide-size     "<width>x<height>", the output image
 *   data-slide-problem  why the phase is "failed", in words a person can act on
 *
 * The stage element carries `data-carousel-stage` and is exactly the slide's layout size. A
 * renderer sets that viewport and the format's scale, waits for "settled", then captures.
 * "failed" means the slide is wrong, not late: capturing it anyway ships the fault.
 *
 * Reaching a slide by URL loads the whole app; slideEvent redraws in the loaded page, which
 * is how a check across hundreds of words stays practical. A capture uses the URL, so each
 * image starts from nothing.
 *
 * Exports: CAROUSEL_CONTRACT, SlidePhase
 * Depends on: none (leaf module)
 */

export const CAROUSEL_CONTRACT = {
  phases: ["loading", "settling", "settled", "failed", "missing"] as const,
  stageAttribute: "data-carousel-stage",
  /** Dispatch on window with the slide number as `detail`, to draw another slide in place. */
  slideEvent: "vocab-carousel-slide",
} as const;

export type SlidePhase = (typeof CAROUSEL_CONTRACT.phases)[number];
