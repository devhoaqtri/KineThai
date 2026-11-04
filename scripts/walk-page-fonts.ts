/**
 * Walk the feed in headless Chrome so every clue page logs its font size.
 *
 * Opens the running dev server at a phone-sized screen, steps through every page of each
 * word (a tap on the upper right steps one page) and moves on to the next word. The feed
 * log writes each page's `page-font` record to logs/feed-<date>.ndjson; read them with
 * `npx tsx scripts/report-page-fonts.ts`.
 *
 * Needs `npm run dev` running, and puppeteer-core plus Chrome on this machine (paths below,
 * or PUPPETEER_CORE / CHROME_PATH).
 *
 * Run:
 *   npx tsx scripts/walk-page-fonts.ts                                   # 30 words, 375x812
 *   npx tsx scripts/walk-page-fonts.ts --url http://localhost:5196 --words 60 --viewport 390x844
 *   npx tsx scripts/walk-page-fonts.ts --difficulty vo-long
 *   npx tsx scripts/walk-page-fonts.ts --host hoa.localhost        # the Chinese site
 * A site is chosen by its host's first label, as in production (anh, hoa, han, nhat, phap,
 * duc, tbn); every browser resolves *.localhost to this machine.
 */
type Page = {
  goto: (url: string, options?: object) => Promise<unknown>;
  evaluate: <T>(fn: (...args: never[]) => T, ...args: unknown[]) => Promise<T>;
  evaluateOnNewDocument: (fn: (...args: never[]) => void, ...args: unknown[]) => Promise<unknown>;
  waitForSelector: (selector: string, options?: object) => Promise<unknown>;
  setViewport: (viewport: object) => Promise<void>;
  mouse: { click: (x: number, y: number) => Promise<void> };
  close: () => Promise<void>;
};

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback;
};
const host = option("host", "localhost");
const base = option("url", `http://${host}:${option("port", "5195")}`);
const wordCount = Number(option("words", "30"));
const [width, height] = option("viewport", "375x812").split("x").map(Number) as [number, number];
const difficulty = option("difficulty", "");
const PUPPETEER =
  process.env.PUPPETEER_CORE ??
  "/usr/local/lib/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js";
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** Pages a word can have, with room to spare; a word that stops changing is left early. */
const MAX_TAPS = 14;
const SETTLE_MS = 900;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const puppeteer = (await import(PUPPETEER)).default as {
    launch: (
      options: object,
    ) => Promise<{ newPage: () => Promise<Page>; close: () => Promise<void> }>;
  };
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(
    ((track: string) => {
      localStorage.setItem("kinetic.orientation.gate", "off");
      localStorage.setItem("kinetic.vocab.difficulty", track);
      const seen: unknown[] = [];
      (window as unknown as { __pageFonts: unknown[] }).__pageFonts = seen;
      document.addEventListener("kinetic:page-font", (event) =>
        seen.push((event as CustomEvent).detail),
      );
    }) as (...args: never[]) => void,
    difficulty,
  );
  await page.goto(`${base}/feed`, { waitUntil: "networkidle2" });
  await page.waitForSelector(".vocab-slot[data-current] .vocab-card", { timeout: 30_000 });
  await sleep(1500);

  const current = () =>
    page.evaluate(() => {
      const card = document.querySelector<HTMLElement>(".vocab-slot[data-current] .vocab-card");
      return { word: card?.dataset.word ?? null, stage: card?.dataset.stage ?? null };
    });

  for (let index = 0; index < wordCount; index += 1) {
    const start = await current();
    const stages = new Set([start.stage]);
    let still = 0;
    for (let tap = 0; tap < MAX_TAPS && still < 2; tap += 1) {
      await page.mouse.click(width * 0.75, height * 0.25);
      await sleep(SETTLE_MS);
      const now = await current();
      if (now.word !== start.word) break;
      if (stages.has(now.stage)) still += 1;
      else still = 0;
      stages.add(now.stage);
    }
    const after = await current();
    if (after.word === start.word) {
      // Still on the same word: scroll the feed one screen on.
      await page.evaluate(() => {
        const viewport = document.querySelector<HTMLElement>(".vocab-viewport");
        if (viewport) viewport.scrollBy({ top: viewport.clientHeight });
      });
      await sleep(SETTLE_MS);
    }
    const fonts = await page.evaluate(
      () => (window as unknown as { __pageFonts: unknown[] }).__pageFonts.length,
    );
    console.log(
      `${index + 1}/${wordCount} ${start.word ?? "?"}: ${stages.size} stages, ${fonts} page records so far`,
    );
  }
  // The feed log flushes every two seconds and on page hide.
  await sleep(3000);
  await page.close();
  await sleep(500);
  await browser.close();
  console.log("Done. Report: npx tsx scripts/report-page-fonts.ts");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
