/**
 * The meaning panel's cut-out around the saved drawer's tab. Exports: HANDLE_EDGE,
 * DRAWER_TAB_MIN_GAP_PX, NOTCH_FILLET_PX, NOTCH_TEXT_GAP_PX, tabEdgePoints,
 * panelTabGap, solveTabNotch, insetBeside. Depends on nothing.
 *
 * On a narrow phone the panel is 84% of the card wide and the tab rides the right edge
 * 30px wide, so the two meet. Where they come closer than DRAWER_TAB_MIN_GAP_PX the panel
 * gives way: its right edge follows the tab's outline grown by that gap, the corners where
 * the cut meets the panel's own edge are rounded off, and everything else stays the box it
 * was. Wider screens never come that close and get no cut at all.
 *
 * All geometry is in the panel's border-box coordinates (origin at its outer top-left
 * corner, in CSS px, before its entrance transform), so the result can be written straight
 * into a clip-path on the panel.
 */

/** The tab's own box and the S of its shoulders (SavedDrawer draws and clips with this). */
const TAB_W = 30;
const TAB_H = 118;
const SHOULDER = 39;
const SHOULDER_CTRL = 19.5;

/**
 * The tab's outline in its own 30 × 118 px box, the screen edge on the right. It leaves
 * the edge on a soft S (tangent to the edge, then rounding over to full width), runs
 * straight past the glyphs and curves back the same way. One path draws the tab's edge
 * and clips its blur, and the panel's notch is grown from the same numbers, so none of
 * them can disagree.
 */
export const HANDLE_EDGE =
  `M${TAB_W} 0 C${TAB_W} ${SHOULDER_CTRL} 0 ${SHOULDER_CTRL} 0 ${SHOULDER} ` +
  `L0 ${TAB_H - SHOULDER} C0 ${TAB_H - SHOULDER_CTRL} ${TAB_W} ${TAB_H - SHOULDER_CTRL} ${TAB_W} ${TAB_H}`;

/**
 * The least clear space between the meaning panel and the drawer's tab. Under it the panel
 * is notched; at or over it the panel is left exactly as laid out. Measured shape to shape
 * (the panel's rounded corners, the tab's curved shoulders), not box to box. A 360px phone
 * overlaps the tab by a pixel and is always cut; on a 390–430px phone the panel ends 1–4px
 * short of the tab's box, which reads as clear beside a shoulder (6–20px shape to shape)
 * but touching beside the straight middle, so only a panel that comes to rest beside the
 * middle is cut there. Landscape keeps 12px and is never cut.
 */
export const DRAWER_TAB_MIN_GAP_PX = 6;
/**
 * The radius the panel's material is rounded to where the notch meets its straight right
 * edge or its bottom, so the cut reads as a shape the panel was given rather than a crop.
 */
export const NOTCH_FILLET_PX = 8;
/** Clear space between the notch's edge and any text the panel keeps beside it. */
export const NOTCH_TEXT_GAP_PX = 6;

/** How far past the panel the clip reaches, so its shadow is not cut off on the other sides. */
const CLIP_OUTSET = 64;
/** A row deviates from the panel's own edge by at least this much to count as cut. */
const CUT_EPSILON = 0.25;

export type Rect = { left: number; top: number; width: number; height: number };
type Point = { x: number; y: number };

function cubic(a: number, b: number, c: number, d: number, t: number) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/**
 * Points along the tab's drawn edge, about a pixel apart, placed in `tab` (its measured
 * rect, in the panel's coordinates). The tab's fill runs from this edge to the screen edge.
 */
export function tabEdgePoints(tab: Rect): Point[] {
  const sx = tab.width / TAB_W;
  const sy = tab.height / TAB_H;
  const place = (x: number, y: number): Point => ({ x: tab.left + x * sx, y: tab.top + y * sy });
  const points: Point[] = [];
  const steps = Math.max(24, Math.ceil(SHOULDER * sy));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(
      place(cubic(TAB_W, TAB_W, 0, 0, t), cubic(0, SHOULDER_CTRL, SHOULDER_CTRL, SHOULDER, t)),
    );
  }
  const straight = Math.max(1, Math.ceil((TAB_H - 2 * SHOULDER) * sy));
  for (let i = 1; i < straight; i++) {
    points.push(place(0, SHOULDER + ((TAB_H - 2 * SHOULDER) * i) / straight));
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(
      place(
        cubic(0, 0, TAB_W, TAB_W, t),
        cubic(TAB_H - SHOULDER, TAB_H - SHOULDER_CTRL, TAB_H - SHOULDER_CTRL, TAB_H, t),
      ),
    );
  }
  return points;
}

/** Signed distance from a point to a rounded box at the origin (negative inside). */
function roundedBoxDistance(p: Point, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  const qx = Math.abs(p.x - width / 2) - width / 2 + r;
  const qy = Math.abs(p.y - height / 2) - height / 2 + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * The clear space between the panel (`width` × `height` with corner `radius`) and the tab,
 * shape to shape. Negative when they overlap.
 */
export function panelTabGap(
  panel: { width: number; height: number; radius: number },
  edge: Point[],
): number {
  let gap = Infinity;
  for (const p of edge) {
    gap = Math.min(gap, roundedBoxDistance(p, panel.width, panel.height, panel.radius));
  }
  // An edge entirely inside the panel's x range but past its right side cannot happen (the
  // tab's fill runs to the screen edge), so the edge points alone decide the gap.
  return gap;
}

export type TabNotch = {
  /** `polygon(...)` for the panel's clip-path. */
  clipPath: string;
  /** SVG path data along the cut, for the border the clip takes away. */
  edge: string;
  /**
   * Where the cut stands, one entry per pixel row from the top of the panel's border box
   * (`right[y]`), for the text and the share tab to keep clear of; Infinity on a row the
   * cut leaves alone, where the panel's own edge and corners are what they always were.
   */
  right: number[];
};

/**
 * The panel's right edge, row by row, before any cut: its straight side, rounded into the
 * top and bottom by its own corner radius.
 */
function boxProfile(width: number, rows: number, radius: number): number[] {
  const height = rows - 1;
  const r = Math.min(radius, width / 2, height / 2);
  const right: number[] = [];
  for (let y = 0; y < rows; y++) {
    const fromCorner = y < r ? r - y : y > height - r ? y - (height - r) : 0;
    right.push(width - r + Math.sqrt(Math.max(0, r * r - fromCorner * fromCorner)));
  }
  return right;
}

/** Morphological opening of the region left of `profile` by a disc: rounds its convex corners. */
function open(profile: number[], radius: number): number[] {
  const rows = profile.length;
  const reach = Math.ceil(radius);
  const at = (values: number[], y: number) => (y < 0 || y >= rows ? -Infinity : values[y]);
  const eroded = profile.map((_, y) => {
    let x = Infinity;
    for (let d = -reach; d <= reach; d++) {
      if (Math.abs(d) > radius) continue;
      x = Math.min(x, at(profile, y + d) - Math.sqrt(radius * radius - d * d));
    }
    return x;
  });
  return profile.map((_, y) => {
    let x = -Infinity;
    for (let d = -reach; d <= reach; d++) {
      if (Math.abs(d) > radius) continue;
      x = Math.max(x, at(eroded, y + d) + Math.sqrt(radius * radius - d * d));
    }
    // Opening never adds material.
    return Math.min(x, profile[y]);
  });
}

const fmt = (n: number) => `${Math.round(n * 10) / 10}px`;

/**
 * The notch the panel needs, or null when the tab is already at least `minGap` clear of it.
 * `tab` is the tab's measured rect in the panel's border-box coordinates.
 */
export function solveTabNotch({
  width,
  height,
  radius,
  tab,
  minGap = DRAWER_TAB_MIN_GAP_PX,
  fillet = NOTCH_FILLET_PX,
}: {
  width: number;
  height: number;
  radius: number;
  tab: Rect;
  minGap?: number;
  fillet?: number;
}): { gap: number; notch: TabNotch | null } {
  const edge = tabEdgePoints(tab);
  const gap = panelTabGap({ width, height, radius }, edge);
  if (!(gap < minGap) || width <= 0 || height <= 0) return { gap, notch: null };

  const rows = Math.max(2, Math.round(height) + 1);
  const box = boxProfile(width, rows, radius);
  // The tab's fill grown by `minGap` in every direction: its left boundary at row `y`
  // (any row, inside the panel or out), Infinity where the grown tab does not reach.
  const grownAt = (y: number) => {
    let x = Infinity;
    for (const p of edge) {
      const dy = p.y - y;
      if (Math.abs(dy) <= minGap) x = Math.min(x, p.x - Math.sqrt(minGap * minGap - dy * dy));
    }
    return x;
  };
  const grown = box.map((_, y) => grownAt(y));
  const bitten = box.map((x, y) => grown[y] < x);
  const firstBite = bitten.indexOf(true);
  if (firstBite < 0) return { gap, notch: null };
  const lastBite = bitten.lastIndexOf(true);
  // Rounding only reaches a fillet past the rows the tab bites into. Elsewhere the panel's
  // own edge and corners stand as drawn: the opening is exact there in theory, and on whole
  // pixel rows it would shave a sliver off the steep end of a corner.
  const reach = Math.ceil(fillet) + 1;
  const opened = open(
    box.map((x, y) => Math.min(x, grown[y])),
    fillet,
  );
  const right = opened.map((x, y) =>
    y >= firstBite - reach && y <= lastBite + reach ? x : box[y],
  );

  const cut = right.map((x, y) => x < box[y] - CUT_EPSILON);
  const first = cut.indexOf(true);
  if (first < 0) return { gap, notch: null };
  const last = cut.lastIndexOf(true);
  // One fillet's run either side, so the clip and the drawn border both start on the
  // panel's own edge and lean into the cut.
  const from = Math.max(0, first - 1);
  const to = Math.min(rows - 1, last + 1);

  // The clip runs down the panel's right side from far above it to far below. Along the
  // cut it is the cut; everywhere else it is the grown tab's outline (or far out where that
  // does not reach), so the panel's soft shadow fades up to the same margin round the tab
  // instead of being sliced off along a straight line.
  const outer = width + CLIP_OUTSET;
  const points: string[] = [`${fmt(-CLIP_OUTSET)} ${fmt(-CLIP_OUTSET)}`];
  let previous = NaN;
  for (let y = -CLIP_OUTSET; y <= height + CLIP_OUTSET; y++) {
    const inPanel = y >= 0 && y < rows;
    const x =
      inPanel && y >= from && y <= to ? right[y] : Math.min(outer, inPanel ? grown[y] : grownAt(y));
    // Long straight runs need only their ends.
    if (x === outer && previous === outer && y < height + CLIP_OUTSET) continue;
    if (previous === outer && x !== outer) points.push(`${fmt(outer)} ${fmt(y - 1)}`);
    points.push(`${fmt(x)} ${fmt(y)}`);
    previous = x;
  }
  points.push(`${fmt(-CLIP_OUTSET)} ${fmt(height + CLIP_OUTSET)}`);

  let path = "";
  for (let y = from; y <= to; y++) {
    const x = Math.round(right[y] * 10) / 10;
    path += `${y === from ? "M" : "L"}${x} ${y}`;
  }
  return {
    gap,
    notch: {
      clipPath: `polygon(${points.join(", ")})`,
      edge: path,
      right: right.map((x, y) => (cut[y] ? x : Infinity)),
    },
  };
}

/**
 * How far something whose right edge sits at `edgeRight` must move in to stay `gap` clear of
 * the notch over the rows `top`…`bottom` (border-box coordinates). Zero when it already is.
 */
export function insetBeside(
  right: number[],
  top: number,
  bottom: number,
  edgeRight: number,
  gap = NOTCH_TEXT_GAP_PX,
): number {
  let inset = 0;
  const from = Math.max(0, Math.floor(top));
  const to = Math.min(right.length - 1, Math.ceil(bottom));
  for (let y = from; y <= to; y++) inset = Math.max(inset, edgeRight - (right[y] - gap));
  return inset;
}
