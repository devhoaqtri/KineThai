/**
 * Render one word to an MP4, headlessly, with no browser automation dependency.
 *
 * Two modes, because they capture different things:
 *
 *   showcase a whole promo clip from /showcase: opening badge, the word in the app's own
 *           chrome, end card. The PAGE owns the sequence; this only waits on its contract.
 *           Prefer this to feed mode for anything being posted.
 *   feed    the real /feed page as a visitor sees it — toolbar, action bar,
 *           progress, all of it — at a phone-sized viewport, for one whole word. This is
 *           what a promo clip wants: the app, not a cutout of it.
 *   export  the stripped /export/$code frame, chrome removed to the preset's clear zone.
 *           Addressable by share code, for when one specific word is wanted.
 *
 * Everything after this — uploading to a Page, pushing a TikTok draft, scheduling — is
 * routine once a good file exists.
 *
 * It drives the installed Chrome over the DevTools protocol and captures with
 * Page.startScreencast, rather than the screen-capture path Export Studio uses. That
 * matters: getDisplayMedia wants a permission prompt and a visible tab, which is exactly
 * what an unattended job cannot give it. Screencast asks the browser for the frames it is
 * already compositing, so there is nothing to approve.
 *
 * Deliberately dependency-free: Node's own WebSocket talks CDP (./lib/cdp), and ffmpeg
 * (already on this machine) assembles the frames. Nothing is added to the app's tree for a tool that
 * belongs in the poster repo eventually.
 *
 * It records in REAL TIME, like Export Studio: a 30-second word takes 30 seconds. Frames
 * arrive irregularly, so each one's own timestamp drives its duration in the concat list
 * and ffmpeg resamples to a constant rate — otherwise the clip drifts out of time with
 * the animation it is supposed to be showing.
 *
 * Usage:
 *   npx tsx scripts/render-export-clip.ts                  # one word off the live feed
 *   npx tsx scripts/render-export-clip.ts --mode export T22
 *
 *     --mode <feed|export>  what to record (default: feed)
 *     --base <url>          app origin (default: http://localhost:5195; the routes exist only
 *                           on the dev server, and hoa.localhost:5195 records the Chinese deck)
 *     --out <path>          output file
 *     --fps <n>             output frame rate (default: 30)
 *     --max <seconds>       give up if the word never finishes (default: 120)
 *   showcase mode:
 *     --intro-style <pop|drop|stamp|slide|flip>  pin the opening (default: picked per take)
 *     --outro-style <light|dark|glass|rise>      pin the end card (default: picked per take)
 *   feed mode:
 *     --css <w>x<h>         CSS viewport, phone-sized (default: 405x720)
 *     --side <px>           left/right inset clear of a platform's crop (default: 25)
 *     --controls <keep|hide>  the top transport controls (default: keep)
 *     --intro <on|off>      the opening badge (default: on)
 *     --badge <text>        what the badge says (default: "Từ gì mà ...")
 *     --outro <on|off>      the anh.chayla.app end card (default: on)
 *     --preset <id>         whose safe area the title corner follows (default: tiktok-clear)
 *     --scale <n>           device pixel ratio (default: 2.667 — 405×720 → 1080×1920)
 *   export mode:
 *     --preset <id>         export preset (default: tiktok-clear)
 *   export and showcase modes:
 *     --dialect <default|douyin>  the palette pool (default: the page's own)
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { getExportPreset } from "../src/features/vocabulary/lib/export-presets";
import { SHOWCASE_CONTRACT } from "../src/features/vocabulary/lib/showcase-contract";
import { addressLocale, siteAddress } from "../src/features/vocabulary/lib/target-language";
import { difficultyChoiceKey } from "../src/features/vocabulary/lib/difficulty-choice";
import { DIFFICULTY_ALL } from "../src/features/vocabulary/lib/difficulty";
import { launchChrome, type Cdp, type ChromeSession } from "./lib/cdp";

/** The frame a preset asks for, read from the app's own table rather than hardcoded. */
function presetSize(id: string): { width: number; height: number } {
  const found = getExportPreset(id);
  return { width: found.width, height: found.height };
}

/** The word on screen, by its position in the stream; 0 when none is. */
const ACTIVE_POSITION = `(() => {
  const mid = innerHeight / 2;
  for (const card of document.querySelectorAll('.vocab-card')) {
    const r = card.getBoundingClientRect();
    if (r.top <= mid && r.bottom >= mid) return Number(card.getAttribute('aria-posinset')) || 0;
  }
  return 0;
})()`;

// ── Arguments ───────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const at = argv.indexOf(`--${name}`);
  return at !== -1 && argv[at + 1] ? argv[at + 1]! : fallback;
}
const code = argv.find(
  (a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1]?.startsWith("--") !== true,
);
const mode = flag("mode", "feed");
if (mode !== "feed" && mode !== "export" && mode !== "showcase") {
  console.error(`--mode must be "showcase", "feed" or "export" (got "${mode}")`);
  process.exit(1);
}
if (mode === "export" && !code) {
  console.error("export mode needs a share code: --mode export <code>");
  process.exit(1);
}
const preset = flag("preset", "tiktok-clear");
const base = flag("base", "http://localhost:5195");
// The end card names the address of the deck being recorded (hoa.localhost → hoa.chayla.app).
const target = addressLocale(new URL(base).host);
const address = siteAddress(target);
// Export and showcase modes only; the feed takes its dialect from the reader's own choice.
const dialect = flag("dialect", "");
const fps = Number(flag("fps", "30"));
const maxSeconds = Number(flag("max", "120"));
// A phone-shaped CSS viewport scaled up to the output size, so the app lays itself out the
// way it does on a phone — the layout a viewer recognises — rather than the desktop one it
// would choose at a literal 1080px wide.
const [cssWidth, cssHeight] = flag("css", "405x720").split("x").map(Number);
// How far in from the top and bottom edges the app's own bars are pushed, in CSS pixels.
// Defaults are roughly TikTok's overlay zones at a 405×720 viewport (~8% and ~15%); pass
// 0,0 to record the app exactly as it sits on a phone.
const [insetTop, insetBottom] = flag("inset", "56,64").split(",").map(Number);
// THE margin for the recorded frame, in CSS pixels, and the only horizontal knob there is.
// Every edge-anchored thing in the recording resolves to exactly this - title, gear, text,
// progress row, button row - so one number moves the whole scene together. It used to be an
// offset added to four different per-element bases, which is why "make the inset smaller"
// kept cutting whichever element was shallowest.
//
// The TOP GRADIENT is exempt and always reaches the edges: it is drawn against the bar and
// pulled back out by exactly this value, so it spans the frame at any margin. A gradient
// that stops short is not a soft top edge, it is a box.
//
// 25 is a judgement call, not a derived number. What a platform actually crops has never
// been measured on a real phone here - see docs/export-recording-layout-handoff.md.
const insetSide = Number(flag("side", "25"));
// Whether the transport controls (play, sound, shuffle) stay in the recorded top bar.
// Kept by default: they are part of what the app looks like. `--controls hide` drops them,
// which is worth a look when a platform's own chrome is already crowding that edge.
const hideControls = flag("controls", "keep") === "hide";
// The end card: blur, an address bar typing anh.chayla.app, Enter, an empty page. It plays
// after the word and is captured in the SAME take, so there is no second encode to match.
// The duration is the stylesheet's --outro-dur; the two have to agree, so it is asserted
// against the live value rather than trusted (check below).
const withIntro = flag("intro", "on") !== "off";
// The badge's words. A flag rather than a constant because it is the one thing in the
// scene a caller is likely to want to change per clip.
const DEFAULT_BADGE = "Từ gì mà ...";
const introText = flag("badge", DEFAULT_BADGE);
const withOutro = flag("outro", "on") !== "off";
const OUTRO_MS = 4600;
// Showcase mode: pin the opening / end-card look. Unset, the page picks a pair per take.
function styleFlag<T extends string>(name: string, allowed: readonly T[]): T | undefined {
  const value = flag(name, "");
  if (!value) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    console.error(`--${name} must be one of ${allowed.join(", ")} (got "${value}")`);
    process.exit(1);
  }
  return value as T;
}
const introStyle = styleFlag("intro-style", SHOWCASE_CONTRACT.introVariants);
const outroStyle = styleFlag("outro-style", SHOWCASE_CONTRACT.outroVariants);
// The safe area comes from the EXPORT preset rather than from numbers invented here, so
// the frame the feed is recorded into and the frame Export Studio draws agree by
// construction. The margins are fractions of the frame, so they carry to any capture size.
const safeOf = getExportPreset(flag("preset", "tiktok-clear")).safe;
const safeTopPx = Math.round(safeOf.top * cssHeight);
const safeRightPx = Math.round(safeOf.right * cssWidth);
const scale = Number(flag("scale", String(1080 / 405)));
const out = resolve(
  flag("out", mode === "feed" ? "./feed-clip.mp4" : `./export-${code ?? "clip"}.mp4`),
);

/**
 * One tap at a point, as a touch rather than a click.
 * @param cdp - the connected client
 * @param x - CSS pixels from the left of the viewport
 * @param y - CSS pixels from the top
 */
async function tap(cdp: Cdp, x: number, y: number): Promise<void> {
  const point = [{ x: Math.round(x), y: Math.round(y) }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point });
  await sleep(60);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

// ── Run ─────────────────────────────────────────────────────────────────────────────────
const frames = mkdtempSync(join(tmpdir(), "chayla-frames-"));
let chrome: ChromeSession | null = null;

async function main() {
  // The frame size is the preset's, read from the page once it loads; the window is sized
  // to it so screencast frames come out at exactly the output resolution.
  chrome = await launchChrome([
    "--mute-audio",
    // Forced at the BROWSER, not through Emulation.setDeviceMetricsOverride. Screencast
    // hands back frames sized in CSS pixels, so an emulated scale factor leaves them at
    // the viewport's logical size and ffmpeg upscales — 1080×1920 in the container,
    // 405×720 of real detail. Forcing the device scale factor makes the surface itself
    // that many pixels, which is what screencast then captures.
    // Both phone-shaped modes need the forced factor; only export mode draws at the
    // frame's literal pixel size and wants 1.
    `--force-device-scale-factor=${mode === "export" ? 1 : scale}`,
    `--window-size=${mode === "export" ? "1080,1920" : `${cssWidth},${cssHeight}`}`,
    // The card plays on its own; nothing should wait for a gesture that will never come.
    "--autoplay-policy=no-user-gesture-required",
  ]);
  const { cdp } = chrome;

  // ── Set the stage, per mode ───────────────────────────────────────────────────────────
  let width: number;
  let height: number;
  let url: string;
  /** Resolves when the thing being recorded has finished; polled below. */
  let isFinished: () => Promise<boolean>;
  /** Feed mode: the card this take is of, needed again by the outro after the loop ends. */
  let recordedPosition = 0;
  let describe: () => Promise<string>;

  if (mode === "showcase") {
    width = Math.round(cssWidth * scale);
    height = Math.round(cssHeight * scale);
    const query = new URLSearchParams();
    if (code) query.set("code", code);
    if (introText !== DEFAULT_BADGE) query.set("badge", introText);
    if (introStyle) query.set("intro", introStyle);
    if (outroStyle) query.set("outro", outroStyle);
    if (dialect) query.set("dialect", dialect);
    url = `${base}/showcase${query.size ? `?${query}` : ""}`;
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: cssWidth,
      height: cssHeight,
      deviceScaleFactor: 0,
      mobile: true,
    });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  } else if (mode === "feed") {
    width = Math.round(cssWidth * scale);
    height = Math.round(cssHeight * scale);
    // Phone metrics, not a 1080px-wide desktop window. `mobile` makes the app lay out the
    // way it does on a phone; the scale factor is what turns that into output pixels.
    // deviceScaleFactor 0 means "keep what the browser already has" — the forced factor
    // above. Passing `scale` here instead would emulate it a second time, and the frames
    // would come back logical again.
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: cssWidth,
      height: cssHeight,
      deviceScaleFactor: 0,
      mobile: true,
    });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    // Push the app's own chrome clear of the platform's. TikTok puts a search row across
    // the top and a caption, action rail and nav across the bottom; a toolbar 12px from
    // the edge sits underneath them. These two variables move the app's bars inward —
    // the bottom one is the shell's existing contract, so the meaning panel's cap and the
    // clue band's foot follow it without anything else being told.
    // A STYLESHEET, not a property set on the root. --vocab-chrome-inset is declared on
    // .vocabulary-shell itself, and a declaration on the element beats a value inherited
    // from an ancestor — so setting it on <html> moves the toolbar and leaves the bottom
    // exactly where it was. A rule targeting the shell wins, and survives re-renders.
    //
    // The vocab-recording class is set unconditionally, NOT alongside the insets: what it
    // hides is chrome that no recording wants, and `--inset 0,0 --side 0` asks for the
    // reader's geometry, not for the drawer handle back.
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const css = ':root{--vocab-chrome-head:${insetTop}px;--vocab-chrome-side:${insetSide}px'
          + ';--vocab-safe-top:${safeTopPx}px;--vocab-safe-right:${safeRightPx}px}'
          // A .vocab-recording-scoped selector, not a bare .vocabulary-shell: the app declares
          // this variable on the shell itself, at the same specificity, and the app's
          // stylesheet is appended AFTER this one - so the plain selector tied and lost on
          // source order, silently. The bottom chrome sat at its reader default of 44px
          // while this script reported it had been moved to ${insetBottom}.
          + '.vocab-recording .vocabulary-shell{--vocab-chrome-inset:${insetBottom}px}';
        // EVERYTHING waits for the document. This runs before the parser has built <html>,
        // so document.documentElement is null here; touching it threw, which silently
        // skipped the flag while the stylesheet — already deferred — went in regardless.
        // That is why the insets worked and the hidden chrome did not.
        const apply = () => {
          const style = document.createElement('style');
          style.textContent = css;
          document.head.appendChild(style);
          // The flag, not the rules. What 'recording' hides is decided in vocabulary.css,
          // beside the elements it names, so renaming one cannot leave a dead selector here.
          //
          // Re-applied on every class mutation: the app renders <html> itself with no
          // className, so hydration resets the attribute. classList.add is a no-op when the
          // class is already present, so the observer cannot retrigger itself.
          const flag = () => document.documentElement.classList.add(...${JSON.stringify(
            hideControls ? ["vocab-recording", "vocab-hide-controls"] : ["vocab-recording"],
          )});
          flag();
          new MutationObserver(flag).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
          });
        };
        if (document.head && document.documentElement) apply();
        else document.addEventListener('DOMContentLoaded', apply, { once: true });
      })();`,
    });
    // Skip the difficulty onboarding. It is a first-visit screen, and a clip that opens on
    // it is showing the reader a form rather than the thing being advertised. Written
    // before any app script runs, so the feed never renders the onboarding at all. The key
    // is the deck locale's slot, matching what the app reads on boot.
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem(${JSON.stringify(difficultyChoiceKey(target))}, ${JSON.stringify(DIFFICULTY_ALL)}); } catch {}`,
    });
    url = `${base}/feed`;
  } else {
    const size = presetSize(preset);
    width = size.width;
    height = size.height;
    // The card measures its own box and lays out from what it first saw, so it has to
    // arrive at the final size rather than be resized into it.
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    url =
      `${base}/export/${code}?preset=${encodeURIComponent(preset)}` +
      (dialect ? `&dialect=${encodeURIComponent(dialect)}` : "");
  }

  console.log(`→ ${url}`);
  await cdp.send("Page.navigate", { url });

  if (mode === "feed") {
    // Wait for a card to be on screen. A fresh load starts the first word at its first
    // page, so recording from here gives a clean beginning with nothing to trim.
    let position = 0;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      position = (await cdp.evaluate<number>(ACTIVE_POSITION)) ?? 0;
      if (position > 0) break;
      await sleep(200);
    }
    if (!position) throw new Error("the feed never put a word on screen");
    // Paused HERE, the moment a card exists, rather than when the intro is injected a
    // second later: by then the first page's words have already finished arriving, and the
    // badge would clear onto text that is just sitting there. Pausing this early leaves the
    // entrance almost entirely unplayed, so it runs after the badge, which is the point of
    // having an intro at all.
    if (withIntro) {
      await cdp.evaluate(
        `document.querySelector('.vocab-player-controls .vocab-icon-button')?.click()`,
      );
    }
    const startedOn = position;
    recordedPosition = position;
    console.log(`  feed at ${cssWidth}×${cssHeight} ×${scale.toFixed(2)} → ${width}×${height}`);
    // One whole word: finished when the feed has moved on to the next one.
    isFinished = async () =>
      ((await cdp.evaluate<number>(ACTIVE_POSITION)) ?? startedOn) !== startedOn;
    // Named by position, not by headword. Reading the answer off the page during the take
    // is possible but was not worth the fuss here: a caller that needs the word can ask
    // the feed API for the word at this position, and export mode reports it outright.
    describe = async () => `position ${startedOn}`;
  } else if (mode === "showcase") {
    // Nothing is driven from out here. The page owns the sequence; this waits on the
    // contract, says go, and stops when it says it is done.
    let phase = "";
    for (let attempt = 0; attempt < 150; attempt += 1) {
      phase = (await cdp.evaluate<string>("document.body.dataset.showcasePhase || ''")) ?? "";
      if (phase === "ready" || phase === "missing") break;
      await sleep(200);
    }
    if (phase === "missing") throw new Error("the showcase had no word to show");
    if (phase !== "ready") throw new Error(`showcase never became ready (phase: "${phase}")`);
    const shown = await cdp.evaluate<string>("document.body.dataset.showcaseWord || ''");
    const looks = await cdp.evaluate<string>(
      "`${document.body.dataset.showcaseIntro} / ${document.body.dataset.showcaseOutro}`",
    );
    console.log(`  showcase "${shown}" (${looks}) at ${width}x${height}`);
    isFinished = async () =>
      (await cdp.evaluate<string>("document.body.dataset.showcasePhase || ''")) === "done";
    describe = async () => shown || "showcase";
  } else {
    let phase = "";
    for (let attempt = 0; attempt < 150; attempt += 1) {
      phase = (await cdp.evaluate<string>("document.body.dataset.exportPhase || ''")) ?? "";
      if (phase === "ready" || phase === "missing") break;
      await sleep(200);
    }
    if (phase === "missing") throw new Error(`No word has the share code "${code}"`);
    if (phase !== "ready") throw new Error(`page never became ready (phase: "${phase || "none"}")`);
    const reported = (await cdp.evaluate<string>("document.body.dataset.exportSize || ''")) ?? "";
    const word = await cdp.evaluate<string>("document.body.dataset.exportWord || ''");
    if (reported !== `${width}x${height}`) {
      throw new Error(
        `preset "${preset}" is ${width}×${height} here but the page reported ${reported}`,
      );
    }
    console.log(`  word "${word}" at ${width}×${height}`);
    isFinished = async () =>
      (await cdp.evaluate<string>("document.body.dataset.exportPhase || ''")) === "done";
    describe = async () => word;
  }

  // Let whatever just mounted settle before the first frame is kept.
  await sleep(400);

  const captured: { file: string; atMs: number }[] = [];
  const startedAt = Date.now();
  cdp.on("Page.screencastFrame", (params) => {
    const sessionId = params.sessionId as number;
    const data = params.data as string;
    const file = join(frames, `f${String(captured.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    captured.push({ file, atMs: Date.now() - startedAt });
    // Chrome stops sending until each frame is acknowledged.
    void cdp.send("Page.screencastFrameAck", { sessionId });
  });

  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    everyNthFrame: 1,
    maxWidth: width,
    maxHeight: height,
  });
  // Export mode holds its card still until cued, so that it is not already part-way
  // through an entrance by the time frames are flowing. The feed needs no cue: it plays
  // on its own, which is the whole point of recording it.
  if (mode === "export") {
    await cdp.evaluate(`window.dispatchEvent(new Event("vocab-export-start"))`);
  }
  if (mode === "showcase") {
    await cdp.evaluate(
      `window.dispatchEvent(new Event(${JSON.stringify(SHOWCASE_CONTRACT.startEvent)}))`,
    );
  }

  // The intro goes in AFTER the screencast is running, so its first frame is captured, and
  // playback is paused for its length: the first clue's entrance is supposed to play once
  // the badge has gone, not behind it.
  if (mode === "feed" && withIntro) {
    const introMs = await cdp.evaluate<number>(`(() => {
      const el = document.createElement('div');
      el.className = 'vocab-intro';
      const veil = document.createElement('div');
      veil.className = 'vocab-intro-veil';
      const ring = document.createElement('div');
      ring.className = 'vocab-intro-ring';
      // Eighteen identical spans; every value that shapes the burst is in the stylesheet's
      // nth-child rules, so the throw can be redesigned without touching this script.
      const burst = document.createElement('div');
      burst.className = 'vocab-intro-confetti';
      for (let i = 0; i < 18; i += 1) burst.appendChild(document.createElement('i'));
      const badge = document.createElement('div');
      badge.className = 'vocab-intro-badge';
      // textContent, not innerHTML: the badge's words come from a command line.
      badge.textContent = ${JSON.stringify(introText)};
      el.append(veil, ring, burst, badge);
      document.body.appendChild(el);
      const raw = getComputedStyle(el).getPropertyValue('--intro-dur').trim();
      const n = parseFloat(raw);
      if (!isFinite(n)) return 0;
      return /ms\s*$/.test(raw) ? n : n * 1000;
    })()`);
    if (!introMs) throw new Error("the intro scene has no --intro-dur; is vocabulary.css loaded?");
    console.log(`  + intro (${introMs}ms) "${introText}"`);

    // Beat 3, in two halves.
    //
    // The first clue's entrance has already played, behind the blur, within a second of the
    // card mounting - pausing cannot win that race, and nothing in the app exposes a replay.
    // Page navigation by tap does: forward then back remounts page one, and a remount is a
    // fresh entrance. (Each touch moves TWO pages, not one - the card's handler answers both
    // pointerup and touchend - but the round trip still lands back on page one, which is all
    // this needs.)
    //
    // It happens HERE, while the badge is still up and every piece of chrome is still
    // hidden, because the page indicator and the stage label are NOT inside the stage: do
    // this after they have slid in and a viewer watches the label flick to a later page and
    // back, which is exactly the flash this ordering removes.
    await sleep(1700);
    const card = await cdp.evaluate<{ y: number } | null>(`(() => {
      const mid = innerHeight / 2;
      const c = [...document.querySelectorAll('.vocab-card')].find(el => {
        const b = el.getBoundingClientRect(); return b.top <= mid && b.bottom >= mid; });
      if (!c) return null;
      const b = c.getBoundingClientRect();
      return { y: b.top + b.height * 0.42 };
    })()`);
    if (card) {
      // Past 65% of the width is the forward zone, under 35% the back one.
      await tap(cdp, cssWidth * 0.86, card.y);
      await sleep(140);
      await tap(cdp, cssWidth * 0.14, card.y);
      await sleep(80);
      // A tap resumes playback on its way through, so the fresh entrance has just started.
      // Freeze it immediately: the second half of the beat is letting the page finish
      // assembling, and the clue is supposed to arrive after that, not under it.
      await cdp.evaluate(
        `document.querySelector('.vocab-player-controls .vocab-icon-button')?.click()`,
      );
    }

    // The assembly plays out; the clue is held at the first frame of its entrance.
    await sleep(Math.max(0, introMs - 1920));
    // Scene first, then play: the stage is dark while the intro is in the document, so
    // starting playback before removing it would run the first words where nobody can see
    // them - the whole fault this beat exists to fix.
    await cdp.evaluate(`document.querySelector('.vocab-intro')?.remove()`);
    await cdp.evaluate(
      `document.querySelector('.vocab-player-controls .vocab-icon-button')?.click()`,
    );
  }

  const deadline = Date.now() + maxSeconds * 1000;
  for (;;) {
    if (await isFinished()) break;
    if (Date.now() > deadline) {
      console.warn(`! never finished within ${maxSeconds}s; using what was captured`);
      break;
    }
    await sleep(250);
  }
  // The outro rides the end of the same take. The feed has already moved to the next word
  // by the time `isFinished` is true, so the first thing this does is stop playback —
  // otherwise the blurred backdrop keeps animating behind an end card that is supposed to
  // be settling. The markup is injected here but every class it uses is defined in
  // vocabulary.css, so the scene can be redesigned without touching this script.
  if (mode === "feed" && withOutro) {
    const declared = await cdp.evaluate<number>(`(() => {
      document.querySelector('.vocab-player-controls .vocab-icon-button')?.click();
      // Back to the word that was just recorded. The feed has already advanced by now, and
      // the end card is meant to settle onto the gradient the clip OPENED on, so that the
      // loop closes on the same colours instead of cutting to another word's palette.
      document.querySelector('.vocab-card[aria-posinset="${recordedPosition}"]')
        ?.scrollIntoView({ block: 'center' });
      const el = document.createElement('div');
      el.className = 'vocab-outro';
      el.innerHTML =
        '<div class="vocab-outro-veil"></div>' +
        '<div class="vocab-outro-bar">' +
          '<span class="vocab-outro-lock"></span>' +
          '<span class="vocab-outro-url">${address}</span>' +
          '<span class="vocab-outro-caret"></span>' +
        '</div>';
      document.body.appendChild(el);
      // Read the duration back off the scene itself, so a re-timed stylesheet cannot leave
      // this script cutting the end card off part-way through. The unit has to be read as
      // well as the number: Chrome hands this back canonicalised to SECONDS ('4.6s') even
      // though the stylesheet says 4600ms, and a bare parseFloat turns 4.6 seconds into
      // 4.6 milliseconds — an end card cut off entirely, by a check meant to prevent that.
      const raw = getComputedStyle(el).getPropertyValue('--outro-dur').trim();
      const n = parseFloat(raw);
      if (!isFinite(n)) return 0;
      return /ms\s*$/.test(raw) ? n : n * 1000;
    })()`);
    if (!declared) {
      throw new Error("the outro scene has no --outro-dur; is vocabulary.css loaded?");
    }
    if (Math.abs(declared - OUTRO_MS) > 1) {
      throw new Error(
        `the outro is ${declared}ms in the stylesheet but this script waits ${OUTRO_MS}ms`,
      );
    }
    console.log(`  + outro (${declared}ms)`);
    // A beat past the end, so the last held frame is the empty page and not a cut.
    await sleep(declared + 250);
  }

  const subject = await describe();
  await cdp.send("Page.stopScreencast");
  await sleep(200);

  if (captured.length < 2) throw new Error(`captured ${captured.length} frames; nothing to encode`);

  // Measure what Chrome actually handed back, which is not always what was asked for: a
  // screencast of a scaled viewport can arrive at the CSS size rather than the device-pixel
  // one, and ffmpeg would then quietly UPSCALE it to the output size. Asking for the scale
  // is not the same as getting it, so the check is on the result, and it refuses rather
  // than warns - a clip that says 1080x1920 and holds 405x720 of detail looks soft with
  // nothing in the file to say why, and that one shipped before anyone noticed.
  const probe = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
     "-of", "csv=p=0", captured[0]!.file],
    { encoding: "utf8" },
  );
  const [grabbedWidth, grabbedHeight] = (probe.stdout ?? "").trim().split(",").map(Number);
  if (grabbedWidth && grabbedHeight) {
    if (grabbedWidth < width || grabbedHeight < height) {
      throw new Error(
        `frames came back at ${grabbedWidth}x${grabbedHeight}, short of the ${width}x${height} asked for; ` +
          "encoding them would upscale. Check --force-device-scale-factor reached the browser.",
      );
    }
    console.log(`  frames captured at ${grabbedWidth}x${grabbedHeight} (native)`);
  }
  const seconds = captured[captured.length - 1]!.atMs / 1000;
  console.log(
    `  ${captured.length} frames over ${seconds.toFixed(1)}s (${(captured.length / seconds).toFixed(1)}/s)`,
  );

  // Each frame shows until the next one arrives. Without this the clip would play at a
  // made-up constant rate and drift away from the animation it is showing.
  const list = captured
    .map((frame, index) => {
      const next = captured[index + 1]?.atMs ?? frame.atMs + 1000 / fps;
      return `file '${frame.file}'\nduration ${((next - frame.atMs) / 1000).toFixed(4)}`;
    })
    .join("\n");
  const listFile = join(frames, "frames.txt");
  // The concat demuxer ignores the last entry's duration unless the file is repeated.
  writeFileSync(listFile, `${list}\nfile '${captured[captured.length - 1]!.file}'\n`);

  console.log("→ encoding");
  const ffmpeg = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      // A silent track. The picture is the whole point, but an upload with no audio stream
      // at all is the odd one out in a platform's ingest pipeline, and a muted track costs
      // a few kilobytes.
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-shortest",
      "-vf",
      // in_range=full is what the frames really are - they arrive as JPEG, which is full
      // range - and out_range=tv is what an H.264 file is expected to hold. Without the
      // conversion the levels stay 0\u2013255 and the file gets tagged yuvj420p; players that
      // read it as 16\u2013235 anyway crush the blacks and blow out the white text.
      `fps=${fps},scale=${width}:${height}:flags=lanczos:in_range=full:out_range=tv,format=yuv420p`,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      // Spelled out rather than left to be guessed at the other end.
      "-pix_fmt",
      "yuv420p",
      "-color_range",
      "tv",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-profile:v",
      "high",
      "-level",
      "4.0",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      out,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  if (ffmpeg.status !== 0)
    throw new Error(`ffmpeg failed:\n${ffmpeg.stderr?.toString().slice(-1500)}`);
  console.log(`✓ ${subject} → ${out}`);
}

main()
  .catch((error) => {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await chrome?.close();
    try {
      rmSync(frames, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      console.warn(`! left behind ${frames}`);
    }
  });
