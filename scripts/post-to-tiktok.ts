/**
 * Hand a rendered clip to the TikTok app running in the Android emulator.
 *
 * This is the second half of the posting path. `render-export-clip.ts` makes the MP4;
 * this puts it in front of TikTok's own upload flow, so the post is composed by the real
 * app rather than by an API. It stops at the editor: you review and tap Post yourself,
 * which is the draft-and-publish arrangement this was built for.
 *
 * Why the indirection — three things that look like they should be simpler but are not:
 *
 *   file:// URIs are refused. Anything targeting Android 7+ gets a FileUriExposedException
 *   when handed a raw path, so the clip has to be referenced by its MediaStore id. Pushing
 *   the file is therefore only step one; it also has to be INDEXED before it can be shared.
 *
 *   The index is not synchronous. MediaProvider notices new files in /sdcard/Movies on its
 *   own, but on its own schedule, so the id is polled for rather than assumed.
 *
 *   TikTok's share activity is not a fixed name. It moves between app versions, so it is
 *   resolved at run time from the intent filters the installed build actually declares.
 *   Hardcoding the component is what breaks silently after an app update.
 *
 * Unattended runs (scripts/tiktok-auto.ts) lean on two more rules: every step the draft
 * needs either happens or the script exits non-zero, and the caption goes in over the
 * emulator's gRPC clipboard (lib/emulator-clipboard), which needs no window focus, no
 * Accessibility grant and keeps every Vietnamese diacritic. Only the cover frame and the
 * location are allowed to fail softly: they are printed as warnings and the draft still
 * stands. TikTok is force-stopped first, so a screen left open by an earlier run or by hand
 * cannot steer the taps.
 *
 * Usage:
 *   npx tsx scripts/post-to-tiktok.ts <clip.mp4>
 *
 *     --avd <name>       emulator to use (default: TikTokPoster)
 *     --serial <id>      adb target, when more than one device is attached
 *     --boot             start the emulator first if nothing is attached
 *     --keep             leave the pushed file on the device afterwards
 *     --code <id>        share code for auto-caption (default: from .meta.json or filename)
 *     --caption <text>   override description text (use --no-caption to leave blank)
 *     --location <name>  location to select (default: "Quán chay Lá"; --no-location to skip)
 *     --cover-at <0..1>  filmstrip fraction for Edit cover (default: .meta.json or 0.42)
 *     --no-cover         skip picking a cover frame
 *     --no-draft         stop on the Post screen instead of saving to Drafts
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { setEmulatorClipboard } from "./lib/emulator-clipboard";

const TIKTOK_PACKAGES = [
  "com.zhiliaoapp.musically", // TikTok, most regions
  "com.ss.android.ugc.trill", // TikTok, some regions
];
/** Scanned by MediaProvider, so a file landing here gets indexed without a manual scan. */
const DEVICE_DIR = "/sdcard/Movies";
const DEFAULT_LOCATION = "Quán chay Lá";
const DEFAULT_HASHTAGS = "#tienganh #hoctienganh #tuvungtienganh #englishvocabulary #anhchayla ";

const argv = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const at = argv.indexOf(`--${name}`);
  return at !== -1 && argv[at + 1] ? argv[at + 1]! : fallback;
}
const has = (name: string) => argv.includes(`--${name}`);

const clip = argv.find((a) => !a.startsWith("--") && a.endsWith(".mp4"));
const avd = flag("avd", "TikTokPoster");
const serial = flag("serial", "");
const explicitCode = flag("code", "");
const explicitCaption = flag("caption", "");
const locationQuery = flag("location", DEFAULT_LOCATION);
const coverAtFlag = flag("cover-at", "");

/** adb, with the serial pinned when one was asked for. */
function adb(args: string[], opts: { quiet?: boolean } = {}) {
  const full = serial ? ["-s", serial, ...args] : args;
  const run = spawnSync("adb", full, { encoding: "utf8" });
  if (!opts.quiet && run.status !== 0) {
    throw new Error(`adb ${args.join(" ")} failed:\n${(run.stderr || run.stdout || "").trim()}`);
  }
  return (run.stdout ?? "").trim();
}

/** The device's answer with the carriage returns adb's shell leaves behind stripped. */
function shell(command: string): string {
  return adb(["shell", command], { quiet: true }).replace(/\r/g, "").trim();
}

function attachedDevices(): string[] {
  return adb(["devices"], { quiet: true })
    .split("\n")
    .slice(1)
    .filter((line) => line.includes("\tdevice"))
    .map((line) => line.split("\t")[0]!);
}

/** Where the emulator's own output goes; the first place to look when a boot fails. */
const BOOT_LOG = "/tmp/emulator-boot.log";

/**
 * The SDK that can boot this AVD: one with an emulator binary AND the system image the
 * AVD names. This machine has two SDKs (Homebrew's, which the shell's ANDROID_HOME points
 * at, and Android Studio's), and the TikTok AVD's Play Store image is only in one of them.
 * Trusting ANDROID_HOME booted it against the other, where it died at once.
 * @returns the SDK root
 * @throws when no candidate has both, naming every root it checked
 */
function sdkForAvd(): string {
  const config = join(homedir(), ".android", "avd", `${avd}.avd`, "config.ini");
  if (!existsSync(config)) throw new Error(`no AVD named ${avd} (looked for ${config})`);
  const sysdir = /^image\.sysdir\.1\s*=\s*(.+)$/m.exec(readFileSync(config, "utf8"))?.[1]?.trim();
  const roots = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    join(homedir(), "Library", "Android", "sdk"),
  ].filter((root, at, all): root is string => !!root && all.indexOf(root) === at);
  const found = roots.find(
    (root) =>
      existsSync(join(root, "emulator", "emulator")) &&
      (!sysdir || existsSync(join(root, sysdir))),
  );
  if (found) return found;
  throw new Error(
    `no Android SDK here has both an emulator and ${avd}'s system image (${sysdir}).\n` +
      `  checked: ${roots.join(", ")}`,
  );
}

async function bootEmulator() {
  const sdk = sdkForAvd();
  console.log(`→ booting ${avd} (SDK ${sdk})`);
  const log = openSync(BOOT_LOG, "w");
  const emulator = spawn(join(sdk, "emulator", "emulator"), ["-avd", avd], {
    detached: true,
    stdio: ["ignore", log, log],
    // The emulator finds the system image through these, not through its own path.
    env: { ...process.env, ANDROID_SDK_ROOT: sdk, ANDROID_HOME: sdk },
  });
  let exited: number | null = null;
  emulator.on("exit", (code) => (exited = code ?? 1));
  emulator.unref();
  // Polled rather than `adb wait-for-device`, which waits forever on an emulator that has
  // already died: the boot log says why, and this says so instead of hanging.
  for (let i = 0; i < 180; i += 1) {
    if (exited !== null) {
      const tail = readFileSync(BOOT_LOG, "utf8").trim().split("\n").slice(-4).join("\n  ");
      throw new Error(`the emulator exited (code ${exited}) before booting:\n  ${tail}`);
    }
    if (attachedDevices().length && shell("getprop sys.boot_completed") === "1") return;
    await sleep(2000);
  }
  throw new Error(`${avd} did not finish booting in 6 minutes; see ${BOOT_LOG}`);
}

/**
 * The MediaStore id for a pushed file, once MediaProvider has noticed it.
 * @param name - the file's name on the device
 * @returns the content:// URI, or null if it never showed up
 */
async function waitForMediaUri(name: string): Promise<string | null> {
  // The quoting survives two hops: Node's argv and the device's own shell.
  const where = `_display_name='${name.replace(/'/g, "")}'`;
  for (let i = 0; i < 30; i += 1) {
    const row = shell(
      `content query --uri content://media/external/video/media` +
        ` --projection _id --where "${where}"`,
    );
    const found = row.match(/_id=(\d+)/);
    if (found) return `content://media/external/video/media/${found[1]}`;
    await sleep(1000);
  }
  return null;
}

/** The installed TikTok package, or null when none of the known ones are present. */
function findTikTok(): string | null {
  const installed = shell("pm list packages");
  return TIKTOK_PACKAGES.find((p) => installed.includes(`package:${p}`)) ?? null;
}

/**
 * The component that actually handles a shared video in the installed TikTok build,
 * read from its intent filters rather than hardcoded.
 * @param pkg - TikTok's package name
 * @returns a `package/activity` component, or null to fall back to the system chooser
 */
function findShareActivity(pkg: string): string | null {
  const listed = shell(
    `cmd package query-activities --brief -a android.intent.action.SEND -t video/mp4`,
  );
  const line = listed.split("\n").find((l) => l.includes(`${pkg}/`));
  return line?.trim().match(/([\w.]+\/[\w.$]+)/)?.[1] ?? null;
}

/** The package of the activity on screen, or "" when it cannot be read. */
function foregroundPackage(): string {
  const line = shell("dumpsys activity activities")
    .split("\n")
    .find((l) => l.includes("topResumedActivity") || l.includes("mResumedActivity"));
  return line?.match(/ u\d+ ([\w.]+)\//)?.[1] ?? "";
}

/**
 * Whether a package reaches the front and stays there for three seconds. Reaching it is
 * not enough: a share screen that cannot read the clip opens for a moment and closes.
 * @param pkg - the package to wait for
 */
async function waitForForeground(pkg: string): Promise<boolean> {
  let held = 0;
  for (let i = 0; i < 40; i += 1) {
    if (foregroundPackage() === pkg) {
      held += 1;
      if (held >= 6) return true;
    } else if (held > 0) {
      return false;
    }
    await sleep(500);
  }
  return false;
}

interface UiNode {
  text: string;
  desc: string;
  id: string;
  clickable: boolean;
  bounds: [number, number, number, number];
  cx: number;
  cy: number;
}

function decodeXmlEntities(s: string): string {
  // uiautomator writes emoji and newlines as numeric references (&#129300; &#10;); left
  // encoded, a caption read back never matches the one pasted. &amp; goes last, so an
  // escaped "&amp;#10;" stays the literal text it was.
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/** Whether the last dumpUi failed: true while a video plays, see waitForNode. */
let lastDumpFailed = false;

/**
 * The screen's UI tree, or [] when uiautomator cannot take one. It cannot while TikTok's
 * feed plays a video ("could not get idle state"), and the file is removed first because
 * reading the previous dump in its place once had the script look at a screen long gone.
 */
function dumpUi(): UiNode[] {
  const out = shell("rm -f /sdcard/window_dump.xml; uiautomator dump /sdcard/window_dump.xml 2>&1");
  lastDumpFailed = !out.includes("dumped to");
  if (lastDumpFailed) return [];
  const xml = shell("cat /sdcard/window_dump.xml");
  const nodes: UiNode[] = [];
  const nodeRe = /<node\s+([^>]+?)\/?\s*>/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(xml)) !== null) {
    const attrs = m[1]!;
    const attr = (name: string) => {
      const am = new RegExp(`${name}="([^"]*)"`).exec(attrs);
      return am ? decodeXmlEntities(am[1]!) : "";
    };
    const bMatch = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr("bounds"));
    if (!bMatch) continue;
    const x1 = Number(bMatch[1]);
    const y1 = Number(bMatch[2]);
    const x2 = Number(bMatch[3]);
    const y2 = Number(bMatch[4]);
    nodes.push({
      text: attr("text"),
      desc: attr("content-desc"),
      id: attr("resource-id"),
      clickable: attr("clickable") === "true",
      bounds: [x1, y1, x2, y2],
      cx: Math.round((x1 + x2) / 2),
      cy: Math.round((y1 + y2) / 2),
    });
  }
  return nodes;
}

/**
 * Poll the screen until a node matches.
 *
 * Two things stand in the way on their own, and are cleared here: Android's "isn't
 * responding" dialog (TikTok stalls on a cold start; Wait lets it finish), and a playing
 * feed video, which makes every dump fail. With `pauseFeed`, a run of failed dumps gets one
 * tap in the middle of the screen, which pauses the feed's video; only waits that expect
 * TikTok's home feed ask for it, since the same tap elsewhere would press something.
 */
async function waitForNode(
  predicate: (n: UiNode) => boolean,
  timeoutMs = 15_000,
  opts: { pauseFeed?: boolean } = {},
): Promise<UiNode | null> {
  const deadline = Date.now() + timeoutMs;
  let failedDumps = 0;
  let paused = false;
  while (Date.now() < deadline) {
    const ui = dumpUi();
    const found = ui.find(predicate);
    if (found) return found;
    // Android's own permission prompts (TikTok asks for contacts after a fresh start) take
    // the screen until answered: always the privacy-keeping answer.
    const deny = ui.find((n) => /:id\/permission_deny(_and_dont_ask_again)?_button$/.test(n.id));
    if (deny) {
      console.log("  declining an Android permission prompt");
      tapNode(deny);
    }
    if (ui.some((n) => /isn.t responding/i.test(n.text))) {
      const wait = ui.find((n) => n.text === "Wait");
      if (wait) {
        console.log("  TikTok isn't responding; waiting for it");
        tapNode(wait);
      }
    }
    failedDumps = lastDumpFailed ? failedDumps + 1 : 0;
    if (opts.pauseFeed && !paused && failedDumps >= 2) {
      tapPoint(540, 1100);
      paused = true;
    }
    await sleep(800);
  }
  return null;
}

/**
 * The screen's UI tree for a decision, retried until a dump succeeds. A failed dump means
 * "cannot tell", never "nothing there": reading it as the latter once had the script press
 * Back on the Post screen and walk out of the share flow.
 * @throws when no dump succeeds within the timeout
 */
async function readScreen(timeoutMs = 15_000): Promise<UiNode[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ui = dumpUi();
    if (!lastDumpFailed) return ui;
    if (Date.now() > deadline) throw new Error("the screen could not be read (uiautomator never went idle)");
    await sleep(800);
  }
}

/**
 * Where the Profile tab sits on this AVD (1080×2400), for when the home feed's video keeps
 * every dump from reading the tab bar. Only used there, and the profile is checked after.
 */
const PROFILE_TAB = { x: 972, y: 2272 };

function tapPoint(x: number, y: number) {
  adb(["shell", "input", "tap", String(Math.round(x)), String(Math.round(y))]);
}

function tapNode(node: UiNode) {
  tapPoint(node.cx, node.cy);
}

interface ClipMeta {
  shareCode?: string | null;
  hintFraction?: number | null;
}

function readClipMeta(mp4Path: string): ClipMeta {
  const metaPath = `${mp4Path}.meta.json`;
  if (!existsSync(metaPath)) return {};
  try {
    return JSON.parse(readFileSync(metaPath, "utf8")) as ClipMeta;
  } catch {
    return {};
  }
}

function inferShareCode(mp4Path: string, meta: ClipMeta): string | null {
  if (explicitCode) return explicitCode.toUpperCase();
  if (meta.shareCode) return meta.shareCode.toUpperCase();
  const stem = basename(mp4Path, ".mp4");
  const match = /^([A-Za-z0-9]{2,6})(?:-|$)/.exec(stem);
  return match ? match[1]!.toUpperCase() : null;
}

function buildAutoCaption(shareCode: string | null): string {
  if (shareCode) {
    const packsDir = resolve(dirname(new URL(import.meta.url).pathname), "../src/features/vocabulary/data/packs");
    if (existsSync(packsDir)) {
      for (const file of readdirSync(packsDir)) {
        if (!file.endsWith(".json")) continue;
        try {
          const pack = JSON.parse(readFileSync(join(packsDir, file), "utf8")) as {
            words?: Array<{ shareCode?: string; word?: string }>;
          };
          const hit = pack.words?.find((w) => w.shareCode?.toUpperCase() === shareCode);
          if (hit?.word) {
            const letters = hit.word.replace(/[^a-zA-Z]/g, "");
            if (letters.length >= 2) {
              const first = letters[0]!.toUpperCase();
              const last = letters[letters.length - 1]!.toUpperCase();
              return (
                `Bắt đầu bằng ${first}, kết thúc bằng ${last} (${letters.length} chữ cái) 🤔 Bạn đoán ra từ gì chưa?\n\n` +
                DEFAULT_HASHTAGS
              );
            }
          }
        } catch {
          // ignore malformed pack file
        }
      }
    }
  }
  return `Từ tiếng Anh này là gì nhỉ? 🤔 Comment đáp án bên dưới nha!\n\n${DEFAULT_HASHTAGS}`;
}

/** The emulator's console port, from the adb serial (`emulator-5554` → 5554). */
function consolePort(): number {
  const target = serial || attachedDevices()[0] || "";
  const port = /^emulator-(\d+)$/.exec(target)?.[1];
  if (!port) throw new Error(`${target || "the device"} is not an emulator; the caption is pasted over its gRPC clipboard`);
  return Number(port);
}

/** Whitespace-folded, so a caption reads the same however the field wraps or trims it. */
const folded = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();

/**
 * Paste the caption into the focused description field and check it landed.
 * @throws when the field does not end up holding the caption's opening
 */
async function pasteCaption(text: string) {
  // A caption ending in a hashtag leaves TikTok mid-tag: its suggestion list stays open and
  // the Back that hides the keyboard drops the tag. A trailing space closes it.
  await setEmulatorClipboard(consolePort(), /\s$/.test(text) ? text : `${text} `);
  adb(["shell", "input", "keyevent", "279"]); // KEYCODE_PASTE
  // The description field echoes what it holds; its opening is enough to prove the paste,
  // and TikTok may turn the hashtags into chips that read differently.
  const opening = folded(text).slice(0, 24);
  const landed = await waitForNode((n) => folded(n.text).includes(opening), 15_000);
  if (!landed) throw new Error("the caption did not reach TikTok's description field");
  reportDroppedWords(text, landed.text, "after the paste");
}

/** Warn about any word of the caption the description field no longer holds. */
function reportDroppedWords(caption: string, field: string, when: string) {
  const held = new Set(folded(field).split(" "));
  const dropped = folded(caption).split(" ").filter((word) => !held.has(word));
  if (dropped.length) warnings.push(`TikTok's description lost ${dropped.join(" ")} ${when}`);
}

/** Sends the share intent once more, set once it has been sent the first time. */
let shareAgain: () => void = () => {};

/** What went wrong without spoiling the draft: printed at the end, never a failure. */
const warnings: string[] = [];

async function prefillPostScreen(file: string) {
  const meta = readClipMeta(file);
  const shareCode = inferShareCode(file, meta);
  const coverAt = coverAtFlag
    ? Math.min(0.95, Math.max(0.05, Number(coverAtFlag) || 0.42))
    : (meta.hintFraction ?? 0.42);
  const caption = explicitCaption || buildAutoCaption(shareCode);

  console.log("→ advancing past TikTok editor");
  let nextBtn = await waitForNode((n) => n.text === "Next", 45_000);
  if (!nextBtn) {
    // TikTok sometimes sits on a black screen after the share; the same share sent again
    // to the now-running app usually opens the editor.
    console.log("  the editor did not open; sharing the clip again");
    shareAgain();
    nextBtn = await waitForNode((n) => n.text === "Next", 45_000);
  }
  if (!nextBtn) throw new Error("TikTok's editor never showed its Next button");
  tapNode(nextBtn);

  const postReady = await waitForNode(
    (n) => n.text === "Edit cover" || n.id.endsWith(":id/hb2"),
    15_000,
  );
  if (!postReady) throw new Error("TikTok's Post screen did not appear after Next");

  // 1. Cover ("screenshot")
  if (!has("no-cover")) {
    const editCover = (await readScreen()).find((n) => n.text === "Edit cover");
    if (editCover) {
      console.log(`→ setting cover frame (${Math.round(coverAt * 100)}%)`);
      tapNode(editCover);
      const filmstrip = await waitForNode((n) => n.id.endsWith(":id/e3b"), 20_000);
      const saveBtn = filmstrip ? (await readScreen()).find((n) => n.text === "Save") : undefined;
      if (filmstrip && saveBtn) {
        const [x1, , x2] = filmstrip.bounds;
        const targetX = Math.round(x1 + (x2 - x1) * coverAt);
        adb([
          "shell",
          "input",
          "swipe",
          String(x1 + 24),
          String(filmstrip.cy),
          String(targetX),
          String(filmstrip.cy),
          "300",
        ]);
        await sleep(700);
        tapNode(saveBtn);
      } else {
        warnings.push("the cover editor had no filmstrip or Save button; TikTok picks the cover");
        // Back only from the cover editor itself: on the Post screen it leaves the flow.
        if (!(await readScreen()).some((n) => n.text === "Edit cover" || n.id.endsWith(":id/hb2"))) {
          adb(["shell", "input", "keyevent", "4"]);
        }
      }
      const back = await waitForNode((n) => n.text === "Edit cover" || n.id.endsWith(":id/hb2"), 15_000);
      if (!back) throw new Error("the Post screen did not come back after the cover editor");
    } else {
      warnings.push("no Edit cover button; TikTok picks the cover");
    }
  }

  // 2. Location
  if (!has("no-location") && locationQuery.toLowerCase() !== "none") {
    const nodes = (await readScreen());
    const quickChip = nodes.find(
      (n) => n.text.toLowerCase().includes(locationQuery.toLowerCase()) && n.cy > 950 && n.cy < 1150,
    );
    let located = false;
    if (quickChip) {
      console.log(`→ selecting location "${quickChip.text}"`);
      tapNode(quickChip);
      await sleep(1000);
      located = true;
    } else {
      const locRow = nodes.find((n) => n.text === "Location");
      if (locRow) {
        console.log(`→ opening Location picker for "${locationQuery}"`);
        tapNode(locRow);
        const match = await waitForNode(
          (n) => n.text.toLowerCase().includes(locationQuery.toLowerCase()) && n.cy > 320,
          6_000,
        );
        if (match) {
          tapNode(match);
          located = true;
          await waitForNode((n) => n.text === "Edit cover" || n.id.endsWith(":id/hb2"), 10_000);
        } else {
          const searchBox = (await readScreen()).find((n) => n.text === "Search locations");
          if (searchBox) {
            tapNode(searchBox);
            await sleep(500);
            const asciiQuery = locationQuery
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/\s+/g, "%s");
            adb(["shell", "input", "text", asciiQuery]);
            const searched = await waitForNode(
              (n) => n.text.toLowerCase().includes(locationQuery.toLowerCase()) && n.cy > 320,
              6_000,
            );
            if (searched) {
              tapNode(searched);
              located = true;
              await waitForNode((n) => n.text === "Edit cover" || n.id.endsWith(":id/hb2"), 10_000);
            }
          }
        }
      }
    }
    if (!located) {
      warnings.push(`location "${locationQuery}" was not found; the post has none`);
      // A picker left open would hide the description and Drafts.
      if (!(await readScreen()).some((n) => n.text === "Edit cover" || n.id.endsWith(":id/hb2"))) {
        adb(["shell", "input", "keyevent", "4"]);
        await waitForNode((n) => n.text === "Edit cover" || n.id.endsWith(":id/hb2"), 8_000);
      }
    }
  }

  // 3. Description
  if (!has("no-caption")) {
    const descBox = (await readScreen()).find((n) => n.id.endsWith(":id/hb2") || n.text === "Add description...");
    if (!descBox) throw new Error("the Post screen has no description field");
    console.log("→ writing description");
    tapNode(descBox);
    await sleep(700);
    await pasteCaption(caption);
    if (!(await readScreen()).some((n) => n.text === "Drafts")) {
      adb(["shell", "input", "keyevent", "4"]); // the keyboard covers Drafts
      await sleep(700);
    }
    const field = (await readScreen()).find((n) => n.id.endsWith(":id/hb2"));
    if (field) reportDroppedWords(caption, field.text, "after the keyboard closed");
  }

  // 4. Save to Drafts
  if (!has("no-draft")) {
    const draftsBtn = await waitForNode((n) => n.text === "Drafts", 8_000);
    if (!draftsBtn) throw new Error("the Post screen has no Drafts button; nothing was saved");
    console.log("→ saving to Drafts");
    tapNode(draftsBtn);
    // Saving closes the Post screen and lands on the home feed, whose playing video fails
    // every dump; so the screen is gone once a dump reads without it or dumps keep failing.
    // The proof of the save is the draft count main() reads next.
    const deadline = Date.now() + 20_000;
    let failed = 0;
    for (;;) {
      await sleep(1000);
      const ui = dumpUi();
      failed = lastDumpFailed ? failed + 1 : 0;
      if (failed >= 3) break;
      if (!lastDumpFailed && !ui.some((n) => n.text === "Drafts" || n.text === "Edit cover" || n.id.endsWith(":id/hb2"))) break;
      // Not a failure on its own: on 2026-11-15 the home feed kept matching these markers
      // after a save that had worked, the retry saved the clip a second time, and a
      // duplicate draft was left behind. The draft count main() reads next decides.
      if (Date.now() > deadline) {
        console.log("  ! the Post screen still reads as open; the draft count decides");
        break;
      }
    }
  }
}

/**
 * The number on the profile's "Drafts: N" tile, from TikTok's home screen (opened when
 * it is not already up). No tile means no drafts.
 * @throws when the profile does not load
 */
async function readDraftCount(pkg: string): Promise<number> {
  let opened = false;
  for (let attempt = 0; attempt < 3 && !opened; attempt += 1) {
    const tab = await waitForNode((n) => n.desc === "Profile", 8_000, { pauseFeed: true });
    if (tab) tapNode(tab);
    else if (lastDumpFailed) tapPoint(PROFILE_TAB.x, PROFILE_TAB.y); // the feed is playing
    else shell(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`); // TikTok is not up
    opened = !!(await waitForNode((n) => n.desc === "Profile menu", 12_000));
  }
  if (!opened) throw new Error("TikTok's profile did not open");
  await sleep(1500); // the drafts tile arrives after the header
  const tile = (await readScreen()).find((n) => n.id.endsWith(":id/tv_draft") || /^Drafts: \d+$/.test(n.text));
  return tile ? Number(/(\d+)/.exec(tile.text)?.[1] ?? 0) : 0;
}

/** A screenshot and UI dump of the moment a run failed, for whoever reads the log. */
function saveFailureSnapshot(): string | null {
  try {
    const dir = join(dirname(new URL(import.meta.url).pathname), "..", "logs", "tiktok-auto", "failures");
    mkdirSync(dir, { recursive: true });
    const base = join(dir, new Date().toISOString().replace(/[:.]/g, "-"));
    const png = spawnSync("adb", [...(serial ? ["-s", serial] : []), "exec-out", "screencap", "-p"], {
      maxBuffer: 64 * 1024 * 1024,
    });
    if (png.status === 0) writeFileSync(`${base}.png`, png.stdout);
    shell("uiautomator dump /sdcard/window_dump.xml >/dev/null 2>&1");
    writeFileSync(`${base}.xml`, shell("cat /sdcard/window_dump.xml"));
    return base;
  } catch {
    return null;
  }
}

async function main() {
  if (!clip) throw new Error("give me a path to an .mp4");
  const file = resolve(clip);
  if (!existsSync(file)) throw new Error(`no such file: ${file}`);

  if (attachedDevices().length === 0) {
    if (!has("boot")) {
      throw new Error(`no device attached. Start the emulator, or pass --boot to start ${avd}.`);
    }
    await bootEmulator();
  }

  // A screen asleep or locked swallows taps, and a dump of it holds nothing to find.
  shell("input keyevent KEYCODE_WAKEUP");
  shell("wm dismiss-keyguard");

  // TikTok's video cache filled the 7.7 GB /data to 99% once ("Almost out of phone
  // storage"). App caches are Android's to drop, so they go before every run; drafts live
  // in TikTok's own files and survive it. Too little left even then fails here, plainly,
  // rather than halfway through saving a draft.
  shell("pm trim-caches 999G");
  const freeKb = Number(shell("df -k /data").split("\n").pop()?.trim().split(/\s+/)[3] ?? 0);
  console.log(`  /data has ${(freeKb / 1_048_576).toFixed(1)} GB free`);
  if (freeKb < 500 * 1024) {
    throw new Error(
      `the emulator has only ${Math.round(freeKb / 1024)} MB free on /data: post or delete drafts in TikTok first`,
    );
  }

  const tiktok = findTikTok();
  if (!tiktok) {
    throw new Error(
      "TikTok is not installed on the device.\n" +
        "  Open the Play Store in the emulator, sign in, and install TikTok first.",
    );
  }

  // A name that will not collide with yesterday's clip in the gallery.
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const name = `${stamp}-${basename(file)}`;
  const target = `${DEVICE_DIR}/${name}`;

  const mb = (statSync(file).size / 1_048_576).toFixed(1);
  console.log(`→ pushing ${basename(file)} (${mb}MB) to ${target}`);
  adb(["push", file, target]);

  console.log("→ waiting for MediaStore to index it");
  const uri = await waitForMediaUri(name);
  if (!uri) {
    throw new Error(
      `the clip is at ${target} but MediaStore never indexed it.\n` +
        "  It can still be picked by hand from TikTok's gallery.",
    );
  }
  console.log(`  ${uri}`);

  // Start TikTok from nothing: an editor, dialog or Drafts list left open by an earlier
  // run (or by hand) would be on screen in place of the one this run expects.
  shell(`am force-stop ${tiktok}`);
  await sleep(800);
  // The draft is proved by the profile's draft count going up by one, so read it first.
  // Reading it also warms TikTok up on its home screen: a share sent straight into a cold
  // TikTok often hung on a black screen or an "isn't responding" dialog.
  const draftsBefore = await readDraftCount(tiktok);
  if (!has("no-draft")) console.log(`  ${draftsBefore} draft(s) in TikTok before this one`);

  const component = findShareActivity(tiktok);
  // --grant-read-uri-permission is what lets TikTok read a URI owned by MediaProvider, but
  // a grant covers only the intent's data (and ClipData), never an extra. An app's own
  // startActivity copies EXTRA_STREAM into ClipData for it; `am` does not, so with the URI
  // in the extra alone TikTok got a SecurityException, opened its share screen and closed
  // it again. `-d` puts the same URI in the data, where the grant reaches it.
  const intent = [
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.SEND",
    "-d",
    uri,
    "-t",
    "video/mp4",
    "--grant-read-uri-permission",
    "--eu",
    "android.intent.extra.STREAM",
    uri,
    ...(component ? ["-n", component] : []),
  ];
  console.log(`→ handing it to ${component ?? "the system chooser"}`);
  adb(intent);
  shareAgain = () => adb(intent);
  // `am start` succeeds once the intent is delivered, not once TikTok shows anything: an
  // app still installing, or one that bounces to its own login, leaves another screen on
  // top. So the success line waits for TikTok to be the screen in front.
  if (!(await waitForForeground(tiktok))) {
    throw new Error(
      `TikTok did not come to the front (${foregroundPackage() || "nothing"} is showing).\n` +
        "  Is it still installing, or not yet opened and signed in? Open it once, then rerun.",
    );
  }

  if (!has("keep")) {
    // The device copy is TikTok's to read until it has imported the clip, so this only
    // removes the previous run's file, never the one just handed over.
    const stale = shell(`ls ${DEVICE_DIR}`)
      .split("\n")
      .filter((f) => f.endsWith(".mp4") && f !== name);
    for (const old of stale) shell(`rm ${DEVICE_DIR}/${old}`);
    if (stale.length) console.log(`  cleared ${stale.length} earlier clip(s)`);
  }

  await prefillPostScreen(file);

  if (!has("no-draft")) {
    const draftsAfter = await readDraftCount(tiktok);
    if (draftsAfter !== draftsBefore + 1) {
      throw new Error(`TikTok holds ${draftsAfter} draft(s), expected ${draftsBefore + 1}; the draft was not saved`);
    }
    console.log(`  ${draftsAfter} draft(s) in TikTok now`);
  }

  for (const warning of warnings) console.warn(`! ${warning}`);
  console.log(
    has("no-draft")
      ? "\n✓ TikTok Post screen is prefilled (cover, location, description). Review and tap Post."
      : "\n✓ Draft saved in TikTok with cover, location, and description prefilled. Open Drafts and tap Post.",
  );
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
  if (attachedDevices().length) {
    const snapshot = saveFailureSnapshot();
    if (snapshot) console.error(`  screen at the failure: ${snapshot}.png (UI tree beside it)`);
  }
  process.exitCode = 1;
});
