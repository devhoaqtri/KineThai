/**
 * A JSON file that several processes change: each change is read, applied and written under
 * one lock, and the write lands whole (a temp file renamed over the old one).
 *
 * Why: the posting jobs overlap (the 13:30 draft run renders for minutes while the 13:30
 * publish run uploads), and a writer that saved the calendar it had read minutes earlier wiped
 * what the other had recorded in between. On 2026-11-18 that erased post 10's Facebook,
 * Instagram and YouTube results, and post 10 went out twice. So a writer never saves a copy it
 * holds: it hands a change to updateJsonFile, which applies it to the file as it is now.
 *
 * The lock is a directory beside the file (`<file>.lock`, mkdir is atomic) holding its owner's
 * pid. A lock whose owner has died, or that is older than STALE_MS, is broken; a live one is
 * waited on for up to WAIT_MS, then the change fails rather than write blind.
 *
 * Exports: withFileLock, updateJsonFile, writeFileAtomic, LOCK_STALE_MS, LOCK_WAIT_MS
 */
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** A lock held this long is taken to be left behind: every change under it takes well under a second. */
export const LOCK_STALE_MS = 2 * 60_000;
/** How long a change waits for another process's before giving up. */
export const LOCK_WAIT_MS = 60_000;

const sleeper = new Int32Array(new SharedArrayBuffer(4));
const sleep = (ms: number) => Atomics.wait(sleeper, 0, 0, ms);

/** Whether a process with this pid still runs (another user's process counts as running). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Whether a lock directory was left behind: its owner gone, or held far too long. */
function abandoned(lock: string): boolean {
  let made: number;
  try {
    made = statSync(lock).mtimeMs;
  } catch {
    return false; // released while we looked: try again
  }
  if (Date.now() - made > LOCK_STALE_MS) return true;
  try {
    const pid = Number(readFileSync(join(lock, "owner"), "utf8").split(" ")[0]);
    return Number.isInteger(pid) && pid > 0 && !alive(pid);
  } catch {
    return false; // its owner has not written its pid yet
  }
}

/**
 * Run `fn` while holding the file's lock. Synchronous, so nothing slow (an upload, a render)
 * belongs inside it.
 * @throws when another live process holds the lock for longer than LOCK_WAIT_MS
 */
export function withFileLock<T>(file: string, fn: () => T, waitMs = LOCK_WAIT_MS): T {
  const lock = `${file}.lock`;
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (abandoned(lock)) {
        rmSync(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline)
        throw new Error(`${basename(file)} is locked by another process (${lock}); try again`);
      sleep(25 + Math.random() * 50);
    }
  }
  try {
    writeFileSync(join(lock, "owner"), `${process.pid} ${new Date().toISOString()}\n`);
    return fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

/** Write a file whole: a reader sees the old text or the new, never half of it. */
export function writeFileAtomic(file: string, text: string) {
  const temp = join(dirname(file), `.${basename(file)}.${process.pid}.tmp`);
  writeFileSync(temp, text);
  renameSync(temp, file);
}

/**
 * Change a JSON file as it is now: read it under its lock, let `change` edit it in place,
 * and write it back, unless `change` returns `false` (nothing to save).
 * @param read - parses the file (and may supply a default when it does not exist)
 * @param write - turns the edited value into the file's text
 * @returns What `change` returned
 */
export function updateJsonFile<T, R>(
  file: string,
  read: () => T,
  write: (value: T) => string,
  change: (value: T) => R,
): R {
  return withFileLock(file, () => {
    const value = read();
    const result = change(value);
    if (result !== false) writeFileAtomic(file, write(value));
    return result;
  });
}
