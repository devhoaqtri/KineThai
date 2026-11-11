/**
 * Public barrel re-exports for this feature module.
 *
 * Exports: BackgroundStyle, CanvasLinkPreview, CanvasSpec, CanvasSticker, Entrance, GradientTransitionPath, Loop, Rhythm, Tempo, COMMENT_CHIPS, DEFAULT_CANVAS, ENTRANCES, FONTS, GRADIENTS, ...
 * Depends on: ./types, ./catalog, ./serialize
 */

export type {
  BackgroundStyle,
  CanvasLinkPreview,
  CanvasSpec,
  CanvasSticker,
  Entrance,
  GradientTransitionPath,
  Loop,
  Rhythm,
  Tempo,
} from "./types";

export {
  COMMENT_CHIPS,
  DEFAULT_CANVAS,
  ENTRANCES,
  FONTS,
  GRADIENTS,
  LOOPS,
  PALETTE,
  RHYTHMS,
  SAFE_CANVAS_BACKGROUND,
  TEMPOS,
  TRANSITION_GRADIENT_PATHS,
} from "./catalog";

export { parseCanvas, serializeCanvas } from "./serialize";

export type {
  Palette,
  PaletteAudit,
  PaletteCheck,
  PaletteCheckUnit,
  PaletteScheme,
  PaletteTone,
} from "./palettes";
export {
  auditPalette,
  describePaletteCheck,
  ensureReadablePalette,
  generatePalette,
  HANDWRITING_FONTS,
  PALETTE_FONTS,
  isPaletteFont,
  hslHex,
  liftBackgroundUntilPaintable,
  normalizePalette,
  PALETTE_SCHEMES,
  PALETTE_THRESHOLDS,
  paletteBackgroundStops,
  paletteBackdropColors,
  paletteSwatches,
  rgbToHex,
} from "./palettes";
export { getPalette, PALETTES, PALETTE_SWATCHES } from "./palette-collection";

export {
  getCanvasEmphasisColor,
  getCanvasEmphasisWordColor,
  getCanvasTextColor,
  getFallbackCanvasBackground,
  getPhotoBackdropTextShadow,
  isTooDarkCanvasBackground,
  isUsableCanvasBackground,
  resolveCanvasBackground,
  resolveTextColorOnPhotoBackdrop,
} from "./contrast";

export { blendOklch, vividGradient } from "./contrast/oklch-blend";

export type { CanvasPatternTheme } from "./patterns";
export {
  CANVAS_PATTERN_THEMES,
  getCanvasPatternTheme,
  getPatternBackgroundPosition,
} from "./patterns";

export type { CanvasSceneTheme } from "./scenes";
export { CANVAS_SCENE_THEMES, getCanvasSceneTheme, getSceneBackgroundStyle } from "./scenes";

export { CanvasStickerLayer } from "./components/CanvasStickerLayer";
