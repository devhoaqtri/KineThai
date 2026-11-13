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
 * Usage:
 *   npx tsx scripts/post-to-tiktok.ts <clip.mp4>
 *
 *     --avd <name>     emulator to use (default: TikTokPoster)
 *     --serial <id>    adb target, when more than one device is attached
 *     --boot           start the emulator first if nothing is attached
 *     --keep           leave the pushed file on the device afterwards
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const TIKTOK_PACKAGES = [
  "com.zhiliaoapp.musically", // TikTok, most regions
  "com.ss.android.ugc.trill", // TikTok, some regions
];
/** Scanned by MediaProvider, so a file landing here gets indexed without a manual scan. */
const DEVICE_DIR = "/sdcard/Movies";

const argv = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const at = argv.indexOf(`--${name}`);
  return at !== -1 && argv[at + 1] ? argv[at + 1]! : fallback;
}
const has = (name: string) => argv.includes(`--${name}`);

const clip = argv.find((a) => !a.startsWith("--") && a.endsWith(".mp4"));
const avd = flag("avd", "TikTokPoster");
const serial = flag("serial", "");

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

  console.log(
    "\n✓ TikTok has the clip. Finish in the emulator:\n" +
      "  add the caption, then Post. A draft saved here stays in this emulator: TikTok keeps\n" +
      "  drafts on the device that made them, so it will not appear on your phone.\n" +
      "  (The caption is not settable from here; TikTok ignores intent text in the editor.)",
  );
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
