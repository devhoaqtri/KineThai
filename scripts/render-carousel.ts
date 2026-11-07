/**
 * Render one word's carousel to a folder of images, using Chrome's own screenshot.
 *
 * The app must be running on the dev server: /carousel/$code does not exist in a production
 * build. The language comes from the host, so --base http://hoa.localhost:5195 renders the
 * Chinese deck.
 *
 * It waits on the page's contract rather than on a delay, and refuses to continue past a
 * slide that reports a problem. Chrome hands back a PNG; the JPEG is made from it with
 * ffmpeg at full chroma, which keeps coloured text sharp, and it is a JPEG because that is
 * the only image format Instagram's API accepts.
 *
 * Usage:
 *   npx tsx scripts/render-carousel.ts <code> [<code> …]
 *
 *     --base <url>      app origin (default: http://localhost:5195)
 *     --format <id>     image shape (default: 4x5)
 *     --theme <id>      pin the palette (default: the word's own pick)
 *     --style <id>      pin the reveal style (default: the word's own pick)
 *     --dialect <id>    default or douyin
 *     --handle <name>   the account named on the closing slide
 *     --url <address>   the address on the closing slide (default: the deck's own)
 *     --out <dir>       parent folder (default: exports/carousel)
 *     --twice           render each word twice and fail on any byte that differs. Run it on
 *                       an idle machine: under full CPU load about one run in six differs by
 *                       a few pixels on letter edges, at most 9 levels of 255. Nobody can
 *                       see that, but it is not byte-identical.
 *     --seams           fail if any swipe shows a step in the backdrop
 *
 * Exports: renderCarousel, CarouselRenderOptions, CarouselRenderResult
 * Depends on: ./lib/cdp, ffmpeg, carousel contract and formats
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

import {
  CAROUSEL_FORMATS,
  SLIDE_SCALE,
  getCarouselFormat,
  getSlideLayoutSize,
} from "../src/features/vocabulary/lib/carousel-formats";
import { getCarouselFolderName } from "../src/features/vocabulary/lib/carousel";
import { addressLocale } from "../src/features/vocabulary/lib/target-language";
import { launchChrome, type Cdp } from "./lib/cdp";

/** A slide that has not settled by now is stuck, not slow. */
const SETTLE_LIMIT_MS = 30_000;
/** One image should encode in well under a second. */
const ENCODE_LIMIT_MS = 30_000;
/** Largest average step across a swipe, in levels of 255. Below this nobody can see a join. */
const SEAM_LIMIT = 1;

export type CarouselRenderOptions = {
  code: string;
  base: string;
  format: string;
  theme?: string;
  style?: string;
  dialect?: string;
  /** The account the closing slide names. */
  handle?: string;
  /** The address the closing slide shows; defaults to the deck's own. */
  url?: string;
  /** Measure the step at each join, which reads every pixel of two edges per slide. */
  measureSeams?: boolean;
  /** Capture a slide that reports a problem instead of stopping at it. */
  allowProblems?: boolean;
  /** Parent folder; the word gets its own folder inside it. */
  out: string;
  /** Called after each slide is captured. */
  onSlide?: (slide: number, count: number) => void;
};

export type CarouselRenderResult = {
  word: string;
  folder: string;
  slides: string[];
  /** SHA-256 of each slide's PNG, in order. */
  hashes: string[];
  /** Average colour step at each join, in levels of 255; empty unless asked for. */
  seams: number[];
  /** Said by the page when it could not keep the answer off slide 1. */
  warning?: string;
};

/** Width and height from a PNG's header. */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function toJpeg(png: Buffer, file: string): void {
  // From a file, not a pipe, and on a clock: a stuck encoder must fail, not freeze the studio.
  const source = `${file}.png`;
  writeFileSync(source, png);
  try {
    const run = spawnSync(
      "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        source,
        // yuvj444p: no chroma subsampling, or red text on a blue field goes soft.
        "-pix_fmt",
        "yuvj444p",
        "-q:v",
        "2",
        "-frames:v",
        "1",
        "-update",
        "1",
        file,
      ],
      { stdio: ["ignore", "ignore", "pipe"], timeout: ENCODE_LIMIT_MS },
    );
    if (run.status !== 0) {
      throw new Error(`ffmpeg failed:\n${run.stderr?.toString().slice(-800) || "it timed out"}`);
    }
  } finally {
    rmSync(source, { force: true });
  }
}

/**
 * The pixels of an 8-bit, non-interlaced PNG, which is what Chrome captures. Read here rather
 * than through ffmpeg, which can sit forever on a piped image, with nothing to say so.
 * @returns Rows of RGB or RGBA bytes, and how many bytes one pixel takes
 */
function decodePng(png: Buffer): { rows: Buffer[]; pixelBytes: number } {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const pixelBytes = png[25] === 6 ? 4 : 3;
  if (png[24] !== 8 || (png[25] !== 2 && png[25] !== 6) || png[28] !== 0) {
    throw new Error("Chrome's PNG is not 8-bit RGB, so the seam cannot be measured");
  }
  const chunks: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    if (png.toString("latin1", at + 4, at + 8) === "IDAT") {
      chunks.push(png.subarray(at + 8, at + 8 + length));
    }
    at += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * pixelBytes;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    const filter = raw[start]!;
    const line = Buffer.from(raw.subarray(start + 1, start + 1 + stride));
    const above = rows[y - 1];
    for (let x = 0; x < stride; x += 1) {
      const a = x >= pixelBytes ? line[x - pixelBytes]! : 0;
      const b = above ? above[x]! : 0;
      const c = above && x >= pixelBytes ? above[x - pixelBytes]! : 0;
      let predicted = 0;
      if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (line[x]! + predicted) & 255;
    }
    rows.push(line);
  }
  return { rows, pixelBytes };
}

/**
 * How far a slide's right edge is from the next one's left edge.
 * @returns Average step per colour channel, in levels of 255
 */
function seamStep(left: Buffer, right: Buffer): number {
  const a = decodePng(left);
  const b = decodePng(right);
  let total = 0;
  let samples = 0;
  a.rows.forEach((row, y) => {
    const last = row.length - a.pixelBytes;
    for (let channel = 0; channel < 3; channel += 1) {
      total += Math.abs(row[last + channel]! - b.rows[y]![channel]!);
      samples += 1;
    }
  });
  return total / samples;
}

async function waitForSlide(
  cdp: Cdp,
  slide: number,
): Promise<{ phase: string; problem?: string; count: number; word: string; size: string }> {
  const deadline = Date.now() + SETTLE_LIMIT_MS;
  for (;;) {
    // The index is read too: right after a navigation this can still be the last slide's page.
    const state = await cdp
      .evaluate<{
        phase?: string;
        index?: string;
        problem?: string;
        count?: string;
        word?: string;
        size?: string;
      }>(
        `(() => {
          const d = document.body?.dataset ?? {};
          return { phase: d.slidePhase, index: d.slideIndex, problem: d.slideProblem,
                   count: d.slideCount, word: d.slideWord, size: d.slideSize };
        })()`,
      )
      .catch(() => null);
    const phase = state?.phase;
    if (phase === "missing")
      return { phase, problem: state?.problem, count: 0, word: "", size: "" };
    if ((phase === "settled" || phase === "failed") && state?.index === String(slide)) {
      return {
        phase,
        problem: state.problem,
        count: Number(state.count),
        word: state.word ?? "",
        size: state.size ?? "",
      };
    }
    if (Date.now() > deadline) {
      throw new Error(`slide ${slide} never settled (phase: "${phase ?? "none"}")`);
    }
    await sleep(40);
  }
}

/**
 * Render every slide of one word.
 * @param options - the word, where to reach the app, and where to write
 * @returns The folder, the slide paths and each slide's hash
 * @throws When a slide reports a problem, or an image comes back the wrong size
 */
export async function renderCarousel(
  options: CarouselRenderOptions,
): Promise<CarouselRenderResult> {
  const format = getCarouselFormat(options.format);
  const layout = getSlideLayoutSize(format);
  const locale = addressLocale(new URL(options.base).host);
  const folder = resolve(options.out, getCarouselFolderName(locale, options.code, format.id));
  const query = new URLSearchParams({ format: format.id });
  if (options.theme) query.set("theme", options.theme);
  if (options.style) query.set("style", options.style);
  if (options.dialect) query.set("dialect", options.dialect);
  if (options.handle) query.set("handle", options.handle);
  if (options.url) query.set("url", options.url);

  const chrome = await launchChrome([
    // Grey-scale text: colour fringes from subpixel text do not survive Instagram's JPEG.
    "--disable-lcd-text",
    "--font-render-hinting=none",
    // One software rasteriser on one thread. With the GPU or several raster threads the
    // gradient's rounding differs between runs, by a level or two across the whole image.
    "--disable-gpu",
    "--num-raster-threads=1",
  ]);
  try {
    const { cdp } = chrome;
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: layout.width,
      height: layout.height,
      deviceScaleFactor: SLIDE_SCALE,
      mobile: false,
    });
    mkdirSync(folder, { recursive: true });
    const slides: string[] = [];
    const hashes: string[] = [];
    const seams: number[] = [];
    let previous: Buffer | null = null;
    let word = "";
    let count = 1;
    for (let slide = 0; slide < count; slide += 1) {
      query.set("slide", String(slide));
      await cdp.send("Page.navigate", {
        url: `${options.base}/carousel/${options.code}?${query}`,
      });
      const state = await waitForSlide(cdp, slide);
      if (state.phase === "missing")
        throw new Error(`No word has the share code "${options.code}"`);
      if (state.phase === "failed" && !options.allowProblems) {
        throw new Error(`slide ${slide + 1} of "${state.word}": ${state.problem}`);
      }
      word = state.word;
      count = state.count;
      if (state.size !== `${format.width}x${format.height}`) {
        throw new Error(`the page drew ${state.size}, not ${format.width}x${format.height}`);
      }
      const { data } = await cdp.send<{ data: string }>("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      const png = Buffer.from(data, "base64");
      // Measured from the file, not assumed: an image that says 1080 and holds less looks
      // soft with nothing to say why.
      const size = pngSize(png);
      if (size.width !== format.width || size.height !== format.height) {
        throw new Error(
          `captured ${size.width}x${size.height}, not ${format.width}x${format.height}`,
        );
      }
      if (options.measureSeams && previous) seams.push(seamStep(previous, png));
      previous = png;
      const file = join(folder, `${String(slide + 1).padStart(2, "0")}.jpg`);
      toJpeg(png, file);
      slides.push(file);
      hashes.push(createHash("sha256").update(png).digest("hex"));
      options.onSlide?.(slide, count);
    }
    // The page wrote these from the same plan the slides came from.
    const written = await cdp.evaluate<{ caption?: string; alt?: string; warning?: string }>(
      `({ caption: document.body.dataset.slideCaption, alt: document.body.dataset.slideAlt,
          warning: document.body.dataset.slideWarning })`,
    );
    writeFileSync(join(folder, "caption.txt"), `${written.caption ?? ""}\n`);
    const alt = JSON.parse(written.alt ?? "[]") as string[];
    writeFileSync(join(folder, "alt.txt"), `${alt.join("\n")}\n`);
    return { word, folder, slides, hashes, seams, warning: written.warning };
  } finally {
    await chrome.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    return at !== -1 ? argv[at + 1] : undefined;
  };
  const valued = new Set(["base", "format", "theme", "style", "dialect", "handle", "url", "out"]);
  const codes = argv.filter(
    (arg, index) =>
      !arg.startsWith("--") &&
      !(argv[index - 1]?.startsWith("--") && valued.has(argv[index - 1]!.slice(2))),
  );
  if (!codes.length) {
    console.error("usage: render-carousel.ts <code> [<code> …] [--base <url>] [--twice]");
    process.exit(1);
  }
  const format = flag("format") ?? CAROUSEL_FORMATS[0]!.id;
  const shared = {
    base: flag("base") ?? "http://localhost:5195",
    format,
    theme: flag("theme"),
    style: flag("style"),
    dialect: flag("dialect"),
    handle: flag("handle"),
    url: flag("url"),
    out: flag("out") ?? "exports/carousel",
  };
  for (const code of codes) {
    const measureSeams = argv.includes("--seams");
    const first = await renderCarousel({ ...shared, code, measureSeams });
    console.log(`✓ ${first.word}: ${first.slides.length} slides → ${first.folder}`);
    if (first.warning) console.log(`  ! ${first.warning}`);
    if (argv.includes("--seams")) {
      const worst = Math.max(...first.seams);
      if (worst > SEAM_LIMIT) {
        throw new Error(`${code}: a swipe steps ${worst.toFixed(2)} levels, over ${SEAM_LIMIT}`);
      }
      console.log(`  seams: worst step ${worst.toFixed(2)} of 255`);
    }
    if (argv.includes("--twice")) {
      const second = await renderCarousel({ ...shared, code });
      const differs = first.hashes.flatMap((hash, index) =>
        hash === second.hashes[index] ? [] : [index + 1],
      );
      if (differs.length)
        throw new Error(`${code}: slides ${differs.join(", ")} differ between runs`);
      console.log(`  identical on a second run`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
