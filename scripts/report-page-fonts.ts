/**
 * Font size per clue page, from the dev feed log, to choose each site's threshold in
 * src/features/vocabulary/lib/line-relax.ts (RELAX_LINE_RULE_BELOW).
 *
 * Every measured clue page logs a `page-font` record under `npm run dev` (on this machine,
 * a phone on the LAN, or `scripts/walk-page-fonts.ts`): the size it was drawn at, the size
 * it gets holding the line rules ("strict") and loosening them ("relaxed"), its full size,
 * and what set the size. This groups the pages by site (its deck language), word and screen,
 * and shows:
 *   - every page's size as a share of the largest page of the same word, so a page set at
 *     half the size of the next one stands out;
 *   - for each candidate threshold (a share of full size: a strict page under it is
 *     loosened when that makes it 5% larger), how many pages would be loosened and how many
 *     would still sit well under their word's largest page.
 * A page marked "1w" has a single unbreakable word as its widest line (a bonded or
 * highlighted word): no line rule holds it small, so no threshold changes it.
 *
 * A site is read from the record's host (anh.localhost → en, hoa.localhost → zh, …);
 * records logged before hosts were recorded count as en.
 *
 * Run:
 *   npx tsx scripts/report-page-fonts.ts                  # every logs/feed-*.ndjson
 *   npx tsx scripts/report-page-fonts.ts logs/feed-2026-11-05.ndjson
 *   npx tsx scripts/report-page-fonts.ts --threshold 0.75 --worst 30 --word stamp
 *   npx tsx scripts/report-page-fonts.ts --site zh             # one site only
 *   npx tsx scripts/report-page-fonts.ts --since 2026-11-05T10   # sessions from then on
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RELAX_LINE_RULE_BELOW } from "../src/features/vocabulary/lib/line-relax";
import { addressLocale, type TargetLocale } from "../src/features/vocabulary/lib/target-language";

type PageFont = {
  word: string | null;
  stage: string | null;
  text: string;
  fontPx: number;
  maxFontPx: number;
  strictFontPx: number;
  relaxedFontPx: number;
  relaxed: boolean;
  bound: string;
  widestUnbreakable?: boolean;
  lines: number;
  boxWidthPx: number;
  boxHeightPx: number;
  host?: string;
  /** Filled in here from the host. */
  site: TargetLocale;
};

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
// One threshold for every site when given; otherwise each site's own.
const override = option("threshold") === undefined ? null : Number(option("threshold"));
const thresholdFor = (site: TargetLocale) => override ?? RELAX_LINE_RULE_BELOW[site];
const onlySite = option("site") as TargetLocale | undefined;
const worst = Number(option("worst") ?? 20);
const onlyWord = option("word");
// Session ids start with their ISO start time (":" and "." as "-"), so they sort by time.
const since = option("since")?.replace(/[:.]/g, "-");
const valued = new Set(["--threshold", "--worst", "--word", "--since", "--site"]);
const files = args.filter((arg, index) => !arg.startsWith("--") && !valued.has(args[index - 1]!));
const logFiles = files.length
  ? files
  : readdirSync("logs")
      .filter((name) => /^feed-.*\.ndjson$/.test(name))
      .sort()
      .map((name) => join("logs", name));

// Latest record per page: a page re-solves on resize and font load, the last one stands.
const pages = new Map<string, PageFont>();
for (const file of logFiles) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.includes('"page-font"')) continue;
    let record: PageFont & { ev?: string; session?: string };
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.ev !== "page-font" || !record.word || !(record.fontPx > 0)) continue;
    if (onlyWord && record.word !== onlyWord) continue;
    if (since && (record.session ?? "") < since) continue;
    record.site = addressLocale(record.host ?? null);
    if (onlySite && record.site !== onlySite) continue;
    const screen = `${record.boxWidthPx}x${record.boxHeightPx}`;
    pages.set(`${record.site}:${record.word}@${screen}|${record.stage}|${record.text}`, record);
  }
}
if (!pages.size) {
  console.log(
    `No page-font records in ${logFiles.join(", ") || "logs/"}.\n` +
      "Read a few words under `npm run dev`, or run scripts/walk-page-fonts.ts, then try again.",
  );
  process.exit(0);
}

/** Mirrors solveMeasuredLines: loosen under t of full size, if that buys 5%. */
const loosensAt = (page: PageFont, t: number) =>
  page.strictFontPx < t * page.maxFontPx && page.relaxedFontPx >= page.strictFontPx * 1.05;
/** The size a page would get at threshold t, from its two logged sizes. */
const sizeAt = (page: PageFont, t: number) =>
  loosensAt(page, t) ? page.relaxedFontPx : page.strictFontPx;

const groups = new Map<string, PageFont[]>();
for (const page of pages.values()) {
  const key = `${page.site}:${page.word}@${page.boxWidthPx}x${page.boxHeightPx}`;
  groups.set(key, [...(groups.get(key) ?? []), page]);
}
const fmt = (value: number, digits = 2) => value.toFixed(digits);
const pad = (value: string | number, width: number) => String(value).padEnd(width);

type Row = { group: string; page: PageFont; share: number };
const rows: Row[] = [];
for (const [group, list] of groups) {
  const largest = Math.max(...list.map((page) => page.fontPx));
  for (const page of list) rows.push({ group, page, share: page.fontPx / largest });
}

console.log(
  `${pages.size} pages, ${groups.size} word×screen groups, from ${logFiles.length} log file(s).`,
);
const sites = [...new Set([...pages.values()].map((page) => page.site))].sort();
console.log(
  `Sites: ${sites
    .map(
      (site) =>
        `${site} ${[...pages.values()].filter((page) => page.site === site).length} pages, threshold ${RELAX_LINE_RULE_BELOW[site]}`,
    )
    .join("; ")}${override === null ? "" : ` (showing ${override} for all)`}.\n`,
);

// 1. The smallest pages relative to their word's largest page.
console.log(`Smallest pages against the largest page of the same word (worst ${worst}):`);
console.log(
  `${pad("share", 7)}${pad("full", 6)}${pad("font", 6)}${pad("strict", 8)}${pad("relaxed", 9)}${pad("used", 8)}${pad("bound", 9)}${pad("lines", 6)}${pad("stage", 15)}word @ screen — text`,
);
for (const { group, page, share } of [...rows].sort((a, b) => a.share - b.share).slice(0, worst)) {
  const bound = `${page.bound}${page.widestUnbreakable ? " 1w" : ""}`;
  console.log(
    [
      pad(fmt(share), 7),
      pad(fmt(page.fontPx / page.maxFontPx), 6),
      pad(fmt(page.fontPx, 0), 6),
      pad(fmt(page.strictFontPx, 0), 8),
      pad(fmt(page.relaxedFontPx, 0), 9),
      pad(page.relaxed ? "relaxed" : "strict", 8),
      pad(bound, 9),
      pad(page.lines, 6),
      pad(page.stage ?? "?", 15),
      `${group} — ${page.text}`,
    ].join(""),
  );
}

// 2. How the shares are spread.
console.log("\nShare of the word's largest page, all pages:");
const buckets = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.01];
let from = 0;
for (const to of buckets) {
  const count = rows.filter((row) => row.share >= from && row.share < to).length;
  const label = to > 1 ? `${fmt(from)}–1.00` : `${fmt(from)}–${fmt(to)}`;
  console.log(
    `  ${pad(label, 11)}${pad(count, 6)}${"#".repeat(Math.round((count / rows.length) * 60))}`,
  );
  from = to;
}

// 3. What each threshold would do, site by site.
console.log(
  "\nThreshold what-if per site (t = share of full size; sizes recomputed from each page's two sizes):",
);
for (const site of sites) {
  const siteGroups = [...groups.values()].filter((list) => list[0]!.site === site);
  const pageCount = siteGroups.reduce((total, list) => total + list.length, 0);
  console.log(`\n  ${site} — ${pageCount} pages, current threshold ${RELAX_LINE_RULE_BELOW[site]}`);
  console.log(
    `  ${pad("t", 6)}${pad("loosened", 10)}${pad("<0.6 of word max", 18)}${pad("<0.7", 8)}worst share`,
  );
  for (const t of [0, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 1]) {
    let loosened = 0;
    let under6 = 0;
    let under7 = 0;
    let worstShare = 1;
    for (const list of siteGroups) {
      const sizes = list.map((page) => sizeAt(page, t));
      const largest = Math.max(...sizes);
      list.forEach((page, index) => {
        if (loosensAt(page, t)) loosened += 1;
        const share = sizes[index]! / largest;
        if (share < 0.6) under6 += 1;
        if (share < 0.7) under7 += 1;
        worstShare = Math.min(worstShare, share);
      });
    }
    const mark = Math.abs(t - thresholdFor(site)) < 1e-9 ? "  ←" : "";
    console.log(
      `  ${pad(fmt(t), 6)}${pad(loosened, 10)}${pad(under6, 18)}${pad(under7, 8)}${fmt(worstShare)}${mark}`,
    );
  }
}
console.log(
  "\nshare = size against the largest page of the same word; full = size against the page's" +
    "\nfull size. A small page with relaxed close to strict is not held small by a line rule:" +
    "\nsee bound (1w = its widest line is one unbreakable word).",
);
