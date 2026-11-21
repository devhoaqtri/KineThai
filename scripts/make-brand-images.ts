/**
 * Make the site's icons and link-preview images from one source each, so they can be
 * regenerated after a brand change instead of edited by hand.
 *
 * Writes into public/:
 * - favicon.svg: the leaf mark, the icon every current browser uses;
 * - favicon.ico (16, 32, 48) for whatever asks for /favicon.ico by name;
 * - apple-touch-icon.png (180) for a home-screen shortcut on iPhone and iPad;
 * - og/<locale>.jpg (1200x630), one per language site: the image a shared link shows.
 *
 * Rendered by the installed Chrome over DevTools (scripts/lib/cdp), fonts from Google Fonts
 * like the app; JPEGs encoded by ffmpeg. Run: npx tsx scripts/make-brand-images.ts
 *
 * Depends on: ./lib/cdp, target-language (titles, language names, addresses), ffmpeg
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { launchChrome, type Cdp } from "./lib/cdp";
import {
  TARGET_LOCALES,
  languageName,
  siteAddress,
  siteBrand,
  type TargetLocale,
} from "../src/features/vocabulary/lib/target-language";

const PUBLIC = resolve(import.meta.dirname, "../public");

const INK = "#0a0014";
const MINT = "#34e0a8";

/** The leaf mark on the site's deep backdrop. */
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b1470"/>
      <stop offset="1" stop-color="${INK}"/>
    </linearGradient>
    <linearGradient id="leaf" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#10b981"/>
      <stop offset="1" stop-color="#8ff5cf"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#bg)"/>
  <path d="M15 49C15 27 29 14 51 13C51 36 38 49 15 49Z" fill="url(#leaf)"/>
  <path d="M19 45C27 36 35 28 44 21" stroke="${INK}" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round" fill="none"/>
</svg>
`;

const FONTS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@500;700&family=Space+Grotesk:wght@700&display=swap";

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The link-preview card for one language site. */
function previewHtml(locale: TargetLocale): string {
  const brand = siteBrand(locale);
  const language = languageName(locale);
  const mark = FAVICON_SVG.replace("<svg ", '<svg width="132" height="132" ');
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${FONTS}">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body {
    box-sizing: border-box; padding: 84px 96px; color: #fff;
    font-family: Inter, system-ui, sans-serif;
    background:
      radial-gradient(900px 520px at 88% 8%, #7c2d9244, transparent 70%),
      radial-gradient(700px 480px at 6% 100%, #0f766e55, transparent 70%),
      linear-gradient(135deg, #2a0d52, ${INK} 70%);
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .top { display: flex; align-items: center; gap: 28px; }
  .brand { font-family: "Space Grotesk", Inter, sans-serif; font-weight: 700; font-size: 76px; letter-spacing: -0.02em; }
  .brand span { color: ${MINT}; }
  h1 { margin: 0; font-size: 68px; line-height: 1.12; font-weight: 700; letter-spacing: -0.015em; text-wrap: balance; }
  .sub { margin-top: 22px; font-size: 32px; font-weight: 500; color: #d9cdee; }
  .address { font-size: 28px; font-weight: 500; color: ${MINT}; }
</style></head><body>
  <div class="top">${mark}<div class="brand">${escape(brand.lead)}<span>${escape(brand.accent)}</span></div></div>
  <div>
    <h1>Đoán từ trước khi<br>đáp án hiện ra</h1>
    <div class="sub">Từ vựng tiếng ${escape(language)} qua gợi ý tiếng Việt · miễn phí</div>
  </div>
  <div class="address">${escape(siteAddress(locale))}</div>
</body></html>`;
}

/**
 * A page that draws the mark at one size, edge to edge. A home-screen icon is drawn square,
 * because iOS rounds it itself and would show the corners of ours as dark wedges.
 */
function iconHtml(size: number, square = false): string {
  const mark = square ? FAVICON_SVG.replace('rx="14" ', "") : FAVICON_SVG;
  const svg = mark.replace("<svg ", `<svg width="${size}" height="${size}" `);
  return `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`;
}

async function render(cdp: Cdp, html: string, width: number, height: number): Promise<Buffer> {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 0, g: 0, b: 0, a: 0 },
  });
  const file = join(PUBLIC, `.render-${width}x${height}.html`);
  writeFileSync(file, html);
  try {
    await cdp.send("Page.navigate", { url: `file://${file}` });
    // Fonts first: a preview drawn in a fallback face would ship as the brand.
    for (let tries = 0; tries < 100; tries += 1) {
      const { result } = await cdp.send<{ result: { value: boolean } }>("Runtime.evaluate", {
        expression: "document.readyState === 'complete' && document.fonts.status === 'loaded'",
        returnByValue: true,
      });
      if (result.value) break;
      await sleep(100);
    }
    await sleep(200);
    const { data } = await cdp.send<{ data: string }>("Page.captureScreenshot", { format: "png" });
    return Buffer.from(data, "base64");
  } finally {
    rmSync(file, { force: true });
  }
}

/** An .ico holding PNG images, the form every browser since Vista reads. */
function icoFromPngs(pngs: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs.map(({ png }) => png)]);
}

function toJpeg(png: Buffer, file: string): void {
  const source = `${file}.png`;
  writeFileSync(source, png);
  try {
    const run = spawnSync(
      "ffmpeg",
      ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", source, "-q:v", "3", file],
      { timeout: 30_000 },
    );
    if (run.status !== 0) throw new Error(`ffmpeg failed on ${file}: ${run.stderr}`);
  } finally {
    rmSync(source, { force: true });
  }
}

const chrome = await launchChrome(["--disable-lcd-text", "--font-render-hinting=none"]);
try {
  const { cdp } = chrome;
  writeFileSync(join(PUBLIC, "favicon.svg"), FAVICON_SVG);
  const icons = [];
  for (const size of [16, 32, 48])
    icons.push({ size, png: await render(cdp, iconHtml(size), size, size) });
  writeFileSync(join(PUBLIC, "favicon.ico"), icoFromPngs(icons));
  writeFileSync(
    join(PUBLIC, "apple-touch-icon.png"),
    await render(cdp, iconHtml(180, true), 180, 180),
  );
  mkdirSync(join(PUBLIC, "og"), { recursive: true });
  for (const locale of TARGET_LOCALES) {
    const file = join(PUBLIC, "og", `${locale}.jpg`);
    toJpeg(await render(cdp, previewHtml(locale), 1200, 630), file);
    console.log(`og/${locale}.jpg  ${Math.round(readFileSync(file).length / 1024)} KB`);
  }
  console.log("favicon.svg, favicon.ico, apple-touch-icon.png written");
} finally {
  await chrome.close();
}
