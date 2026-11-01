/**
 * Measured line layout: nothing is placed on a line it was not shown to fit, and a
 * syllable is not left alone on a row when the page reads better without that.
 * Run: npx tsx scripts/check-measured-lines.ts
 */
import assert from "node:assert/strict";
import {
  MAX_MEASURED_SEGMENTS,
  getPunctuationPhraseEdges,
  isBreakOneWordFromEdge,
  solveMeasuredLines,
  type MeasuredLineBounds,
  type MeasuredSegment,
} from "../src/features/kinetic-text";

const INDENT_EM = [0, 0.22, 0.38, 0.5];
const indentOf = (line: number) => INDENT_EM[Math.min(line, INDENT_EM.length - 1)]!;

/** Segments from "text:widthEm" pairs; a text with a space is one unbreakable phrase. */
function segments(...items: [string, number][]): MeasuredSegment[] {
  let index = 0;
  return items.map(([text, widthEm]) => {
    const words = text.split(" ").map((word) => ({ text: word, index: index++ }));
    return {
      segment: { key: words.map((word) => `${word.index}-${word.text}`).join("|"), words },
      widthEm,
      heightEm: 1.25,
    };
  });
}

const BOUNDS: MeasuredLineBounds = {
  lineWidthPx: 346,
  hardHeightPx: 575,
  budgetHeightPx: 524,
  budgetLineEm: 1.6,
  maxFontPx: 92,
  floorFontPx: 64,
  gapEm: 0.24,
  lineGapEm: 0.072,
};

const show = (lines: { segments: { words: { text: string }[] }[] }[]) =>
  lines
    .map((line) =>
      line.segments.map((segment) => segment.words.map((word) => word.text).join(" ")).join(" "),
    )
    .join(" / ");

/** Every line inside its box at the solved size, and the block inside the band. */
function assertInBounds(label: string, items: MeasuredSegment[], bounds: MeasuredLineBounds) {
  const solved = solveMeasuredLines(items, bounds);
  assert.ok(solved, `${label}: expected a layout`);
  const widths = new Map(items.map((item) => [item.segment.key, item]));
  let blockEm = 0;
  solved.lines.forEach((line, lineIndex) => {
    const reach =
      line.segments.reduce((sum, segment) => sum + widths.get(segment.key)!.widthEm, 0) +
      bounds.gapEm * (line.segments.length - 1) +
      indentOf(lineIndex);
    assert.ok(
      reach * solved.fontPx <= bounds.lineWidthPx + 1e-6,
      `${label}: line ${lineIndex} is ${(reach * solved.fontPx).toFixed(1)}px in a ${bounds.lineWidthPx}px box (${show(solved.lines)})`,
    );
    assert.equal(line.indentEm, indentOf(lineIndex), `${label}: line ${lineIndex} indent`);
    blockEm += 1.25 + (lineIndex > 0 ? bounds.lineGapEm : 0);
  });
  assert.ok(
    blockEm * solved.fontPx <= bounds.hardHeightPx + 1e-6,
    `${label}: block is taller than its band`,
  );
  assert.ok(solved.fontPx <= bounds.maxFontPx + 1e-9, `${label}: font above the page maximum`);
  // Nothing dropped, duplicated or reordered.
  assert.deepEqual(
    solved.lines.flatMap((line) => line.segments.map((segment) => segment.key)),
    items.map((item) => item.segment.key),
    `${label}: segments must come back whole and in order`,
  );
  return solved;
}

// ── A short syllable is not stranded when the line above has room for it. ─────────
// The estimate broke this as "Nhớ hồi / đó / không?"; measured, "đó" has room to join.
{
  const items = segments(["Nhớ", 1.9], ["hồi", 1.5], ["đó", 1.2], ["không?", 3.6]);
  const solved = assertInBounds("stranded syllable", items, BOUNDS);
  const lone = solved.lines.filter(
    (line) => line.segments.length === 1 && line.segments[0]!.words[0]!.text === "đó",
  );
  assert.equal(lone.length, 0, `"đó" must not sit alone: ${show(solved.lines)}`);
  console.log(`OK — stranded syllable joins a line: ${show(solved.lines)}`);
}

// ── Last-line scrap: "… / và các / bước." becomes a line that carries the scrap. ──
{
  const items = segments(
    ["Công", 2.0],
    ["thức", 1.9],
    ["nấu", 1.6],
    ["một", 1.7],
    ["món,", 2.1],
    ["ghi", 1.4],
    ["nguyên liệu", 4.6],
    ["và", 1.1],
    ["các", 1.5],
    ["bước.", 2.3],
  );
  const solved = assertInBounds("last-line scrap", items, BOUNDS);
  const last = solved.lines[solved.lines.length - 1]!;
  assert.ok(
    last.segments.length > 1 || last.segments[0]!.words.length > 1,
    `the last line must not be a lone scrap: ${show(solved.lines)}`,
  );
  console.log(`OK — no scrap on the last line: ${show(solved.lines)}`);
}

// ── A bound phrase is one segment: it moves to the next line whole. ───────────────
{
  const items = segments(["Xách", 2.6], ["ba lô", 3.1], ["lên", 1.7], ["và", 1.1], ["đi!", 1.6]);
  const solved = assertInBounds("bound phrase", items, BOUNDS);
  const together = solved.lines.some((line) =>
    line.segments.some((segment) => segment.words.map((word) => word.text).join(" ") === "ba lô"),
  );
  assert.ok(together, `"ba lô" must stay one segment: ${show(solved.lines)}`);
  console.log(`OK — a joined word stays on one line: ${show(solved.lines)}`);
}

// ── One phrase wider than the box: the page shrinks until it fits, never overflows. ─
{
  const items = segments(["Tối", 1.5], ["trước chuyến bay,", 11.1], ["ngồi", 2.0], ["đè", 1.4]);
  const solved = assertInBounds("wide phrase", items, BOUNDS);
  assert.ok(
    solved.fontPx < BOUNDS.floorFontPx,
    "a phrase wider than the box must take the page under the floor",
  );
  console.log(`OK — a too-wide phrase shrinks the page to ${solved.fontPx.toFixed(1)}px`);
}

// ── The height budget yields to the legibility floor, the hard band never does. ───
{
  const items = segments(
    ["Gồm", 2.4],
    ["7", 0.7],
    ["chữ", 2.0],
    ["cái,", 1.9],
    ["bắt", 1.7],
    ["đầu", 2.1],
  );
  const tight = { ...BOUNDS, budgetHeightPx: 120 };
  const solved = assertInBounds("floor over budget", items, tight);
  assert.ok(
    solved.fontPx >= Math.min(tight.floorFontPx, tight.maxFontPx) - 1e-6 ||
      solved.lines.length === 1,
    `the budget alone must not push the page under its floor (${solved.fontPx.toFixed(1)}px)`,
  );
  const squeezed = assertInBounds("hard band", items, { ...tight, hardHeightPx: 90 });
  assert.ok(squeezed.fontPx * 1.25 <= 90 + 1e-6, "the hard band always holds");
  console.log("OK — budget gives way to the floor; the band does not");
}

// ── Deterministic, and bounded. ───────────────────────────────────────────────────
{
  const items = segments(["Mười", 2.3], ["giờ", 1.6], ["đêm", 2.0], ["con", 1.7], ["chưa", 2.2]);
  assert.deepEqual(solveMeasuredLines(items, BOUNDS), solveMeasuredLines(items, BOUNDS));
  const many = segments(
    ...Array.from({ length: MAX_MEASURED_SEGMENTS + 1 }, (_, i): [string, number] => [
      `w${i}`,
      1.5,
    ]),
  );
  assert.equal(
    solveMeasuredLines(many, BOUNDS),
    null,
    "too many segments falls back to the estimate",
  );
  assert.equal(solveMeasuredLines([], BOUNDS), null);
  assert.equal(solveMeasuredLines(items, { ...BOUNDS, lineWidthPx: 0 }), null);
  console.log("OK — deterministic; unsolvable input returns null");
}

// ── Sweep: whatever the widths, the result is inside its bounds. ──────────────────
{
  let seed = 7;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  let cases = 0;
  for (let round = 0; round < 400; round += 1) {
    const count = 2 + Math.floor(random() * 11);
    const items = segments(
      ...Array.from({ length: count }, (_, i): [string, number] => [
        random() < 0.2 ? `a${i} b${i}` : `a${i}`,
        0.8 + random() * (random() < 0.1 ? 9 : 3.4),
      ]),
    );
    const width = 200 + random() * 700;
    assertInBounds(`sweep ${round}`, items, {
      ...BOUNDS,
      lineWidthPx: width,
      hardHeightPx: 150 + random() * 500,
      budgetHeightPx: 100 + random() * 500,
      maxFontPx: 60 + random() * 60,
    });
    cases += 1;
  }
  console.log(`OK — ${cases} random pages all inside their bounds`);
}

// ── Phrase edges: a comma, full stop or semicolon closes a phrase (the reader's `|`). ──
const tokensOf = (items: MeasuredSegment[]) =>
  items.flatMap((item) => item.segment.words.map((word) => word.text));

/**
 * Breaks (as the first word index of the next line) one word away from an edge: a line
 * ending one word after the mark, or beginning with the one word that carries it.
 */
function phraseViolations(lines: { segments: MeasuredSegment["segment"][] }[], edges: number[]) {
  const segs = lines.flatMap((line) => line.segments);
  const between = (from: number, to: number) =>
    segs.filter((seg) => {
      const at = seg.words[0]!.index;
      return at >= from && at < to && seg.words.some((word) => /\p{L}|\p{N}/u.test(word.text));
    }).length;
  const bad: number[] = [];
  lines.slice(1).forEach((line) => {
    const at = line.segments[0]!.words[0]!.index;
    if (edges.includes(at)) return;
    if (edges.some((edge) => (at < edge ? between(at, edge) <= 1 : between(edge, at) === 1))) {
      bad.push(at);
    }
  });
  return bad;
}

// The font an arrangement can be set at, exactly as the solver computes it.
function fontFor(items: MeasuredSegment[], mask: number, bounds: MeasuredLineBounds): number {
  let widest = 0;
  let height = 0;
  let line = 0;
  let width = 0;
  let lineHeight = 0;
  let open = 0;
  items.forEach((item, index) => {
    width += (open ? bounds.gapEm : 0) + item.widthEm;
    lineHeight = Math.max(lineHeight, item.heightEm);
    open += 1;
    if (index === items.length - 1 || mask & (1 << index)) {
      widest = Math.max(widest, width + indentOf(line));
      height += lineHeight + (line ? bounds.lineGapEm : 0);
      line += 1;
      width = 0;
      lineHeight = 0;
      open = 0;
    }
  });
  return Math.min(
    bounds.maxFontPx,
    bounds.lineWidthPx / widest,
    bounds.hardHeightPx / height,
    Math.max(
      bounds.budgetHeightPx / (line * bounds.budgetLineEm),
      Math.min(bounds.maxFontPx, bounds.floorFontPx),
    ),
  );
}
function linesFor(items: MeasuredSegment[], mask: number) {
  const lines: { segments: MeasuredSegment["segment"][] }[] = [{ segments: [] }];
  items.forEach((item, index) => {
    lines.at(-1)!.segments.push(item.segment);
    if (index < items.length - 1 && mask & (1 << index)) lines.push({ segments: [] });
  });
  return lines;
}

{
  // Which words close a phrase.
  assert.deepEqual(getPunctuationPhraseEdges(["Mở", "cửa", "ra,", "ồ", "đẹp", "quá!"]), [3]);
  assert.deepEqual(getPunctuationPhraseEdges(["Hà", "Nội.", "Sài", "Gòn;", "Huế"]), [2, 4]);
  assert.deepEqual(
    getPunctuationPhraseEdges(["Bảo", 'nhau,"', "đi", "thôi"]),
    [2],
    "inside quotes",
  );
  assert.deepEqual(
    getPunctuationPhraseEdges(["giá", "1.000", "đồng"]),
    [],
    "a mark inside a number",
  );
  assert.deepEqual(
    getPunctuationPhraseEdges(["xong", "rồi."]),
    [],
    "the end of the page is no edge",
  );
  assert.deepEqual(
    getPunctuationPhraseEdges(["Nhỏ", "thôi:", "đi"]),
    [],
    "a colon is not one of the marks",
  );
  // A sentence-final mark closes a phrase at least as firmly as a comma does. This used
  // to assert the opposite for `?`, which let a line end one word past a sentence end.
  assert.deepEqual(
    getPunctuationPhraseEdges(["Thật", "sao?", "Ừ"]),
    [2],
    "a question mark closes a phrase",
  );
  assert.deepEqual(
    getPunctuationPhraseEdges(["Cháy", "rồi!", "Chạy"]),
    [2],
    "so does an exclamation mark",
  );
  assert.deepEqual(getPunctuationPhraseEdges(["Thôi", "vậy…", "Về"]), [2], "so does an ellipsis");
  assert.deepEqual(
    getPunctuationPhraseEdges(["Hỏi", "rằng:", "“Sao?”", "Ừ"]),
    [3],
    "a sentence mark inside closing quotes still closes the phrase",
  );
  // The failure that motivated this: without an edge at the `?`, the solver was free to
  // pull the next sentence's first word back onto this sentence's line.
  {
    const items = segments(
      ["Bạn", 2.0],
      ["có", 1.3],
      ["nghe", 2.4],
      ["không?", 3.6],
      ["Tôi", 1.9],
      ["ngồi", 2.3],
      ["đây", 2.1],
      ["mãi", 2.0],
      ["rồi.", 2.3],
    );
    const tokens = items.flatMap((item) => item.segment.words.map((word) => word.text));
    const edges = getPunctuationPhraseEdges(tokens);
    assert.ok(edges.includes(4), "the word after `không?` opens a new phrase");
    const solved = solveMeasuredLines(
      items,
      { ...BOUNDS, lineWidthPx: 220 },
      {
        phraseEdges: edges,
      },
    );
    assert.ok(solved, "expected a layout");
    const rows = solved.lines.map((line) =>
      line.segments.flatMap((segment) => segment.words.map((word) => word.index)),
    );
    assert.ok(
      !rows.some((row) => row[row.length - 1] === 4),
      `no line may end one word past the sentence: ${show(solved.lines)}`,
    );
    console.log(`OK — a sentence end is honoured as a phrase edge: ${show(solved.lines)}`);
  }

  // A page with nothing to say about phrases solves exactly as before.
  const plain = segments(
    ["Mười", 2.3],
    ["giờ", 1.6],
    ["đêm", 2.0],
    ["con", 1.7],
    ["chưa", 2.2],
    ["về", 1.9],
  );
  const unphrased = solveMeasuredLines(plain, BOUNDS);
  assert.deepEqual(solveMeasuredLines(plain, BOUNDS, { phraseEdges: [] }), unphrased);
  assert.deepEqual(solveMeasuredLines(plain, BOUNDS, {}), unphrased);

  // The comma case: neither "ra," alone at the start of a line nor "ồ" alone after it.
  const items = segments(
    ["Mở", 1.9],
    ["cửa", 1.6],
    ["ra,", 1.4],
    ["ồ", 1.0],
    ["đẹp", 1.7],
    ["quá!", 2.0],
  );
  const edges = getPunctuationPhraseEdges(tokensOf(items));
  const solved = solveMeasuredLines(items, BOUNDS, { phraseEdges: edges });
  assert.ok(solved);
  assert.deepEqual(
    phraseViolations(solved.lines, edges),
    [],
    `one word left beside the comma: ${show(solved.lines)}`,
  );
  console.log(`OK — a comma keeps its phrases whole: ${show(solved.lines)}`);
}

// ── Pages use the same test, one token per word. ────────────────────────────────
{
  const words = ["Trời", "lạnh,", "rét", "và", "gió", "thổi", "mạnh"];
  const edges = getPunctuationPhraseEdges(words);
  assert.equal(isBreakOneWordFromEdge(words, edges, 2), false, "right after the comma is the edge");
  assert.equal(isBreakOneWordFromEdge(words, edges, 3), true, "one word after the comma");
  assert.equal(
    isBreakOneWordFromEdge(words, edges, 1),
    true,
    "the comma's own word opening a page",
  );
  assert.equal(isBreakOneWordFromEdge(words, edges, 4), false, "two words after the comma");
  assert.equal(isBreakOneWordFromEdge(words, [], 3), false, "no edges, no rule");
  console.log("OK — a page break is held to the same rule");
}

// ── Sweep: the rule gives way only when no clean layout can be set as large. ───────
{
  let seed = 11;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  let pages = 0;
  let violations = 0;
  for (let round = 0; round < 300; round += 1) {
    const count = 4 + Math.floor(random() * 8);
    const marks = new Set([
      1 + Math.floor(random() * (count - 2)),
      1 + Math.floor(random() * (count - 2)),
    ]);
    const items = segments(
      ...Array.from({ length: count }, (_, i): [string, number] => [
        marks.has(i) ? `w${i}${random() < 0.5 ? "," : ";"}` : `w${i}`,
        0.9 + random() * 2.6,
      ]),
    );
    const bounds = { ...BOUNDS, lineWidthPx: 220 + random() * 500, maxFontPx: 60 + random() * 50 };
    const edges = getPunctuationPhraseEdges(tokensOf(items));
    assertInBounds(`phrase sweep ${round}`, items, bounds);
    const phrased = solveMeasuredLines(items, bounds, { phraseEdges: edges })!;
    const broken = phraseViolations(phrased.lines, edges);
    pages += 1;
    if (!broken.length) continue;
    violations += 1;
    // It broke the rule, so no clean arrangement may be set at least as large.
    for (let mask = 0; mask < 1 << (count - 1); mask += 1) {
      if (phraseViolations(linesFor(items, mask), edges).length) continue;
      assert.ok(
        fontFor(items, mask, bounds) < phrased.fontPx,
        `round ${round}: chose ${show(phrased.lines)} although a clean layout fits as large`,
      );
    }
  }
  console.log(
    `OK — ${pages} pages with commas or semicolons; the rule gave way on ${violations}, each only where nothing clean fits as large`,
  );
}

// ── Long pages: >9 syllables spread to a readable size instead of cramming small. ──
{
  const items = segments(
    ["Mưa", 2.4],
    ["rơi", 2.2],
    ["ngoài", 2.6],
    ["hiên,", 2.5],
    ["gió", 2.1],
    ["lùa", 2.0],
    ["lá", 1.9],
    ["khô", 2.2],
    ["bay", 2.1],
    ["đi", 1.8],
    ["lặng", 2.5],
    ["lẽ.", 2.7],
  );
  const syllables = items.reduce((n, s) => n + s.segment.words.length, 0);
  assert.ok(syllables > 9, `test needs a long page, got ${syllables} syllables`);
  const solved = assertInBounds("long page spread", items, BOUNDS);
  // The largest font any sub-4-line cram could reach, for comparison.
  let cramFont = 0;
  for (let mask = 0; mask < 1 << (items.length - 1); mask += 1) {
    if (linesFor(items, mask).length >= 4) continue;
    cramFont = Math.max(cramFont, fontFor(items, mask, BOUNDS));
  }
  assert.ok(
    solved.lines.length >= 4,
    `a >9-syllable page must spread to at least 4 lines: ${show(solved.lines)}`,
  );
  assert.ok(
    solved.fontPx >= cramFont - 1e-6,
    `spreading must never set the page smaller than the best cram (${solved.fontPx.toFixed(1)} < ${cramFont.toFixed(1)})`,
  );
  console.log(
    `OK — long page spreads to ${solved.lines.length} lines at ${solved.fontPx.toFixed(1)}px, never below the best 3-line cram ${cramFont.toFixed(1)}px: ${show(solved.lines)}`,
  );
}

// ── Live inversion: a clean cram outscores the top spread candidate, yet another
// spread reads larger. That bigger one must win — a small spread must not veto it.
// Reconstructed from a shipped lead (11 syllables, two comma edges, joined "các=em",
// "im_lặng") at the bounds a live card measured; the old pick kept 3 lines at ~47px.
{
  const items = segments(
    ["Chia", 2.32],
    ["đất,", 2.32],
    ["anh", 1.74],
    ["cả", 1.16],
    ["phần", 2.32],
    ["to,", 1.74],
    ["các em", 3.18],
    ["im lặng", 3.86],
    ["mãi", 1.74],
  );
  const live = {
    lineWidthPx: 486,
    hardHeightPx: 606,
    budgetHeightPx: 520,
    budgetLineEm: 1.6,
    maxFontPx: 89,
    floorFontPx: 64,
    gapEm: 0.24,
    lineGapEm: 0.06,
  };
  const edges = getPunctuationPhraseEdges(tokensOf(items));
  const solved = solveMeasuredLines(items, live, { phraseEdges: edges });
  assert.ok(solved, "live inversion: expected a layout");
  assert.ok(
    solved.lines.length >= 4,
    `the larger spread must not be vetoed by a smaller one: ${show(solved.lines)}`,
  );
  assert.ok(
    phraseViolations(solved.lines, edges).length === 0,
    `spreading must not break the phrase rule on the way: ${show(solved.lines)}`,
  );
  console.log(
    `OK — spread bigger than the cram it replaces, phrases kept: ${show(solved.lines)} @ ${solved.fontPx.toFixed(1)}px`,
  );
}

// ── A crowded page is never set on two lines ──────────────────────────────────
//
// Two lines holding eight syllables are two LONG lines, and a long line is set small
// because its width is what binds — so that page lands noticeably smaller than the scenes
// either side of it. Past six syllables the layout must use three lines or more. This is a
// floor, not a preference: unlike the spread rule above it cannot be outvoted by score.
{
  // The page this was written for, at the widths a real card measures.
  const items = segments(
    ["Chuông", 3.0],
    ["reo", 2.0],
    ["inh", 1.9],
    ["ỏi,", 1.6],
    ["vươn", 2.5],
    ["vai", 1.9],
    ["ngồi", 2.3],
    ["dậy", 2.4],
  );
  const count = items.reduce((total, item) => total + item.segment.words.length, 0);
  assert.equal(count, 8, "the example page is eight syllables");

  let twoLiners = 0;
  let widths = 0;
  for (let width = 240; width <= 560; width += 10) {
    const solved = solveMeasuredLines(items, { ...BOUNDS, lineWidthPx: width });
    if (!solved) continue;
    widths += 1;
    if (solved.lines.length < 3) {
      twoLiners += 1;
      console.error(`      ${width}px -> ${show(solved.lines)}`);
    }
  }
  assert.ok(widths > 0, "no width produced a layout; the check would pass vacuously");
  assert.equal(
    twoLiners,
    0,
    `an 8-syllable page was set on fewer than 3 lines at ${twoLiners} width(s)`,
  );
  const sample = solveMeasuredLines(items, { ...BOUNDS, lineWidthPx: 346 })!;
  console.log(
    `OK — 8 syllables never on two lines across ${widths} widths: ${show(sample.lines)} @ ${sample.fontPx.toFixed(1)}px`,
  );
}

// Six or fewer is still free to use two lines — the cap must not creep downward. The
// comma case asserted earlier in this file is exactly that: six syllables, two lines,
// "Mở cửa ra, / ồ đẹp quá!". It is still passing above, so the boundary is covered from
// the allowed side; this checks the first syllable PAST it, which is where the cap bites.
{
  const items = segments(
    ["Mở", 2.0],
    ["cửa", 2.3],
    ["ra,", 1.8],
    ["ồ", 1.2],
    ["đẹp", 2.2],
    ["quá", 2.4],
    ["nhỉ!", 2.5],
  );
  const count = items.reduce((total, item) => total + item.segment.words.length, 0);
  assert.equal(count, 7, "one syllable past the cap");
  let belowFloor = 0;
  let widths = 0;
  for (let width = 240; width <= 560; width += 10) {
    const solved = solveMeasuredLines(items, { ...BOUNDS, lineWidthPx: width });
    if (!solved) continue;
    widths += 1;
    if (solved.lines.length < 3) belowFloor += 1;
  }
  assert.ok(widths > 0, "no width produced a layout; the check would pass vacuously");
  assert.equal(belowFloor, 0, `a 7-syllable page fell below three lines at ${belowFloor} width(s)`);
  console.log(
    `OK — seven syllables, the first past the cap, never on two lines (${widths} widths)`,
  );
}

// A page with too few segments to reach three lines is exempt rather than unset.
{
  const items = segments(["một hai ba b\u1ed1n", 6.0], ["năm sáu bảy", 4.5]);
  const solved = solveMeasuredLines(items, BOUNDS);
  assert.ok(solved, "a two-segment page must still get a layout");
  console.log(`OK — too few segments to reach the floor still renders: ${show(solved.lines)}`);
}

// A Han page's edges are a preference: a wide blank beside a comma must not be kept with
// the words before it when that sets the whole page small.
{
  const items = segments(
    ["我要", 2],
    ["先", 1],
    ["____，", 2.6],
    ["再", 1],
    ["换", 1],
    ["上", 1],
    ["干净", 2],
    ["的", 1],
    ["衣服。", 2.5],
  );
  const words = items.flatMap((item) => item.segment.words.map((word) => word.text));
  const phraseEdges = getPunctuationPhraseEdges(words);
  assert.ok(phraseEdges.length > 0, "a full-width comma must make a phrase edge");
  const strict = solveMeasuredLines(items, BOUNDS, { phraseEdges });
  const soft = solveMeasuredLines(items, BOUNDS, { phraseEdges, softPhraseEdges: true });
  assert.ok(strict && soft, "both pages must get a layout");
  assert.ok(soft.fontPx > strict.fontPx, `soft edges did not read larger: ${show(soft.lines)}`);
  console.log(`OK — a Han page is not held small by its comma: ${show(soft.lines)}`);
}

console.log("\nAll measured-line checks passed.");
