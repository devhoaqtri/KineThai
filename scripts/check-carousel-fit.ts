/**
 * Guard: real decks fit real slides, in every format and language.
 *
 * Unit tests cannot answer this, because fit depends on fonts and layout in a browser. So
 * this drives the dev server through /carousel/$code: the words most likely to fail, by
 * length of clue, answer and panel, plus a random sample for shapes nobody thought of. Every
 * slide must reach "settled", and each slide reports its own fit problems.
 *
 * It also proves the fonts. slide-settle can only ask whether a face was loaded; Chrome's
 * CSS.getPlatformFontsForNode says which font actually painted each glyph, so a fallback to
 * a system font fails here by name.
 *
 * Usage (the dev server must be running):
 *   npx tsx scripts/check-carousel-fit.ts
 *
 *     --hardest <n>   words picked as hardest, per format (default: 200)
 *     --random <n>    random words, per format (default: 100)
 *     --workers <n>   browsers at once (default: 4)
 *     --format <id>   one format only (default: all)
 *     --port <n>      dev server port (default: 5195)
 *     --seed <n>      random sample seed (default: 1)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
  CAROUSEL_FORMATS,
  SLIDE_SCALE,
  getSlideLayoutSize,
} from "../src/features/vocabulary/lib/carousel-formats";
import { CAROUSEL_CONTRACT } from "../src/features/vocabulary/lib/carousel-contract";
import { launchChrome, type Cdp } from "./lib/cdp";

const DATA = "src/features/vocabulary/data";
/** Deck folder and the subdomain that serves it locally. */
const DECKS: { dir: string; host: string }[] = [
  { dir: "packs", host: "localhost" },
  { dir: "zh", host: "hoa.localhost" },
  { dir: "ko", host: "han.localhost" },
  { dir: "ja", host: "nhat.localhost" },
  { dir: "fr", host: "phap.localhost" },
  { dir: "de", host: "duc.localhost" },
  { dir: "es", host: "tbn.localhost" },
];
const SETTLE_LIMIT_MS = 30_000;
/** What gets painted on a slide, for the font proof. */
const PAINTED =
  "[data-kinetic-glyph], .vocab-spelling-char, .vocab-spelling-label, .vocab-meaning, " +
  ".vocab-pronunciation, .vocab-example p, .vocab-export-brand, .carousel-hook, " +
  ".carousel-count, .carousel-swipe, .carousel-handle, .carousel-address";

type Word = {
  word: string;
  shareCode?: string;
  leadVi?: string;
  defVi?: string;
  anticipateVi?: string;
  meaningVi?: string;
  usage?: { en?: string }[];
};
type Job = { code: string; word: string; host: string; format: string };
type Failure = { job: Job; slide: number; problem: string };

const argv = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const at = argv.indexOf(`--${name}`);
  return at !== -1 && argv[at + 1] ? argv[at + 1]! : fallback;
}
const port = flag("port", "5195");

function loadDeck(dir: string): Word[] {
  const folder = join(DATA, dir);
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      const deck = JSON.parse(readFileSync(join(folder, name), "utf8")) as { words?: Word[] };
      return deck.words ?? [];
    })
    .filter((word) => word.shareCode);
}

/** A small seeded generator, so a failure can be reproduced from its seed. */
function randomFrom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const clueLength = (word: Word) =>
  Math.max(
    word.leadVi?.length ?? 0,
    word.defVi?.length ?? 0,
    word.anticipateVi?.length ?? 0,
    word.usage?.[0]?.en?.length ?? 0,
  );
const panelLength = (word: Word) =>
  (word.meaningVi?.length ?? 0) + (word.usage?.[0]?.en?.length ?? 0);

/**
 * Pick the words for one format: the longest by each measure, then a random sample.
 * @param hardest - how many hard words in all
 * @param random - how many random words in all
 * @param seed - the random sample's seed
 * @returns Words with the host that serves them
 */
function pickWords(hardest: number, random: number, seed: number) {
  const decks = DECKS.map((deck) => ({ ...deck, words: loadDeck(deck.dir) })).filter(
    (deck) => deck.words.length,
  );
  const measures = [clueLength, panelLength, (word: Word) => word.word.length];
  const next = randomFrom(seed);
  const picked = new Map<string, { word: Word; host: string }>();
  const add = (word: Word, host: string) => picked.set(`${host}/${word.shareCode}`, { word, host });
  const hardPerDeck = Math.ceil(hardest / decks.length / measures.length);
  const randomPerDeck = Math.ceil(random / decks.length);
  for (const { words, host } of decks) {
    for (const measure of measures) {
      const ranked = [...words].sort((a, b) => measure(b) - measure(a));
      for (const word of ranked.slice(0, hardPerDeck)) add(word, host);
    }
    for (let index = 0; index < randomPerDeck; index += 1) {
      add(words[Math.floor(next() * words.length)]!, host);
    }
  }
  return [...picked.values()];
}

async function slideState(cdp: Cdp, slide: number) {
  const deadline = Date.now() + SETTLE_LIMIT_MS;
  for (;;) {
    const state = await cdp
      .evaluate<{ phase?: string; index?: string; problem?: string; count?: string }>(
        `(() => { const d = document.body?.dataset ?? {};
          return { phase: d.slidePhase, index: d.slideIndex, problem: d.slideProblem, count: d.slideCount }; })()`,
      )
      .catch(() => null);
    if (state?.phase === "missing") return { phase: "missing", problem: state.problem, count: 0 };
    if (
      (state?.phase === "settled" || state?.phase === "failed") &&
      state.index === String(slide)
    ) {
      return { phase: state.phase, problem: state.problem, count: Number(state.count) };
    }
    if (Date.now() > deadline) return { phase: "timeout", problem: "never settled", count: 0 };
    await sleep(30);
  }
}

/** Every font that painted the slide and is not one the page loaded itself. */
async function systemFonts(cdp: Cdp): Promise<string[]> {
  const { root } = await cdp.send<{ root: { nodeId: number } }>("DOM.getDocument", { depth: 0 });
  const { nodeIds } = await cdp.send<{ nodeIds: number[] }>("DOM.querySelectorAll", {
    nodeId: root.nodeId,
    selector: `[data-carousel-stage] :is(${PAINTED})`,
  });
  const found = new Set<string>();
  for (const nodeId of nodeIds) {
    const { fonts } = await cdp.send<{ fonts: { familyName: string; isCustomFont: boolean }[] }>(
      "CSS.getPlatformFontsForNode",
      { nodeId },
    );
    for (const font of fonts) if (!font.isCustomFont) found.add(font.familyName);
  }
  return [...found];
}

async function worker(jobs: Job[], failures: Failure[], done: () => void) {
  const chrome = await launchChrome(["--font-render-hinting=none"]);
  try {
    const { cdp } = chrome;
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const format = CAROUSEL_FORMATS.find((item) => item.id === job!.format)!;
      const layout = getSlideLayoutSize(format);
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: layout.width,
        height: layout.height,
        deviceScaleFactor: SLIDE_SCALE,
        mobile: false,
      });
      let count = 1;
      for (let slide = 0; slide < count; slide += 1) {
        // The first slide loads the word; the rest redraw in place, or a run takes hours.
        if (slide === 0) {
          await cdp.send("Page.navigate", {
            url: `http://${job.host}:${port}/carousel/${job.code}?format=${job.format}&handle=chayla.app`,
          });
        } else {
          await cdp.evaluate(
            `(delete document.body.dataset.slidePhase,
              window.dispatchEvent(new CustomEvent(${JSON.stringify(CAROUSEL_CONTRACT.slideEvent)}, { detail: ${slide} })), 1)`,
          );
        }
        const state = await slideState(cdp, slide);
        if (state.phase !== "settled") {
          failures.push({ job, slide, problem: state.problem ?? state.phase });
        } else {
          const fonts = await systemFonts(cdp);
          if (fonts.length) {
            failures.push({ job, slide, problem: `Painted by a system font: ${fonts.join(", ")}` });
          }
        }
        if (state.count) count = state.count;
        else break;
      }
      done();
    }
  } finally {
    await chrome.close();
  }
}

async function main() {
  const hardest = Number(flag("hardest", "200"));
  const random = Number(flag("random", "100"));
  const seed = Number(flag("seed", "1"));
  const only = flag("format", "");
  const formats = CAROUSEL_FORMATS.filter((format) => !only || format.id === only);
  const words = pickWords(hardest, random, seed);
  const jobs: Job[] = formats.flatMap((format) =>
    words.map(({ word, host }) => ({
      code: word.shareCode!,
      word: word.word,
      host,
      format: format.id,
    })),
  );
  const total = jobs.length;
  console.log(`${total} carousels: ${words.length} words in ${formats.length} format(s)`);
  const failures: Failure[] = [];
  let finished = 0;
  const done = () => {
    finished += 1;
    if (finished % 25 === 0) console.log(`  ${finished}/${total}, ${failures.length} problem(s)`);
  };
  await Promise.all(
    Array.from({ length: Number(flag("workers", "4")) }, () => worker(jobs, failures, done)),
  );

  const byProblem = new Map<string, Failure[]>();
  for (const failure of failures) {
    const key = failure.problem.replace(/\d+ px/, "N px").replace(/“.*”/, "“…”");
    byProblem.set(key, [...(byProblem.get(key) ?? []), failure]);
  }
  for (const [problem, group] of [...byProblem].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${group.length} × ${problem}`);
    for (const { job, slide } of group.slice(0, 6)) {
      console.log(`    ${job.format} ${job.host} ${job.code} “${job.word}” slide ${slide + 1}`);
    }
  }
  if (failures.length) {
    console.error(`\n${failures.length} slide(s) failed in ${total} carousels`);
    process.exitCode = 1;
  } else {
    console.log(`\nall ${total} carousels fit, drawn in their own fonts`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
