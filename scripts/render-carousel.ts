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
 *     --out <dir>       parent folder (default: exports/carousel)
 *     --twice           render each word twice and fail on any byte that differs
 *
 * Exports: renderCarousel, CarouselRenderOptions, CarouselRenderResult
 * Depends on: ./lib/cdp, ffmpeg, carousel contract and formats
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import {
  CAROUSEL_FORMATS,
  SLIDE_SCALE,
  getCarouselFormat,
  getSlideLayoutSize,
} from "../src/features/vocabulary/lib/carousel-formats";
import { resolveTarget, siteAddress } from "../src/features/vocabulary/lib/target-language";
import { launchChrome, type Cdp } from "./lib/cdp";

/** A slide that has not settled by now is stuck, not slow. */
const SETTLE_LIMIT_MS = 30_000;

export type CarouselRenderOptions = {
  code: string;
  base: string;
  format: string;
  theme?: string;
  style?: string;
  dialect?: string;
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
};

/** Width and height from a PNG's header. */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function toJpeg(png: Buffer, file: string): void {
  const run = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "image2pipe",
      "-c:v",
      "png",
      "-i",
      "pipe:0",
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
    { input: png, stdio: ["pipe", "ignore", "pipe"] },
  );
  if (run.status !== 0) throw new Error(`ffmpeg failed:\n${run.stderr?.toString().slice(-800)}`);
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
  const locale = resolveTarget(new URL(options.base).host);
  const brand = siteAddress(locale).split(".")[0];
  const folder = resolve(options.out, `${brand}-chayla-${options.code}-${format.id}`);
  const query = new URLSearchParams({ format: format.id });
  if (options.theme) query.set("theme", options.theme);
  if (options.style) query.set("style", options.style);
  if (options.dialect) query.set("dialect", options.dialect);

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
      if (state.phase === "failed") {
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
      const file = join(folder, `${String(slide + 1).padStart(2, "0")}.jpg`);
      toJpeg(png, file);
      slides.push(file);
      hashes.push(createHash("sha256").update(png).digest("hex"));
      options.onSlide?.(slide, count);
    }
    return { word, folder, slides, hashes };
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
  const valued = new Set(["base", "format", "theme", "style", "dialect", "out"]);
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
    out: flag("out") ?? "exports/carousel",
  };
  for (const code of codes) {
    const first = await renderCarousel({ ...shared, code });
    console.log(`✓ ${first.word}: ${first.slides.length} slides → ${first.folder}`);
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
