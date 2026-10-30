/**
 * Compile a WordCrawler deck into the served vocabulary data.
 *
 * Usage:
 *   npm run vocab:import -- <deck.json>                # rewrite the base catalog.json
 *   npm run vocab:import -- <deck.json> --pack <name>  # compile a read-only provider pack
 *                                                      #   → data/packs/<name>.json
 *   npm run vocab:import -- <deck.json> --pack <name> --staged
 *                                                      # compile a pack but keep it OUT of
 *                                                      #   the served feed: → data/packs/incoming/
 *
 * Both modes validate through normalizeDeck (which throws on a duplicate id, a leaked
 * answer or a malformed field) and write atomically via a temp file + rename, so the
 * previous file stays intact if anything fails. The feed merges catalog.json with every
 * data/packs/*.json at load time (lib/catalog-source.ts); packs never overwrite the
 * admin-editable base — on a shared id/headword the base wins.
 *
 * A Word Refinery hand-off stamps `meta.format`; this importer refuses a stamp it was not
 * written for (assertRefineryFormat) before reading the deck. See docs/word-refinery-import.md.
 *
 * A `--staged` pack lands in `data/packs/incoming/`, one level below the
 * `data/packs/*.json` glob the loader globs (that pattern is non-recursive), so the words
 * are embedded in the repo and validated but stay invisible to the feed. Moving the file
 * up into `data/packs/` and rebuilding is the whole activation step — no code changes.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDeck } from "../src/features/vocabulary/lib/schema.ts";
import { toDeck } from "../src/features/vocabulary/lib/custom-pack.ts";

const USAGE = "Usage: npm run vocab:import -- <WordCrawler JSON path> [--pack <name>]";

/**
 * The hand-off stamp Word Refinery writes into `meta.format`, and the newest
 * `meta.formatVersion` this importer knows how to read. See
 * docs/word-refinery-import.md and word-refinery's docs/kinemedia-export.md — the two
 * are one contract, so a bump on either side means updating both.
 */
const REFINERY_FORMAT = "word-refinery.kinemedia-deck";
const REFINERY_FORMAT_VERSION = 1;

// Split off an optional `--pack <name>`; what remains must be exactly one deck path.
const argv = process.argv.slice(2);
// `--staged` is a modifier on `--pack`: write the compiled pack into the non-globbed
// incoming/ folder so it is embedded but not served. Pulled out first so it can't shift
// the `--pack` index below.
const staged = argv.includes("--staged");
if (staged) argv.splice(argv.indexOf("--staged"), 1);
// `--locale <code>` routes a pack into data/<code>/ — a separate deck served only on that
// language's domain (lib/target-language.ts), never merged into the English feed.
const localeAt = argv.indexOf("--locale");
let locale: string | undefined;
if (localeAt !== -1) {
  locale = argv[localeAt + 1];
  argv.splice(localeAt, locale ? 2 : 1);
  if (!locale || !/^(zh|ko|ja|fr|de|es)$/.test(locale))
    throw new Error("--locale must be zh, ko, ja, fr, de or es");
}
const packAt = argv.indexOf("--pack");
let packName: string | undefined;
if (packAt !== -1) {
  packName = argv[packAt + 1];
  argv.splice(packAt, packName ? 2 : 1);
}
const source = argv[0];

/** Restrict a pack name to a filesystem-safe slug so a provider name can't escape data/packs. */
function packSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`Invalid pack name "${name}"; use letters, digits, - or _`);
  return slug;
}

/**
 * Refuse a Word Refinery hand-off this importer was not written for.
 *
 * A deck with no `meta.format` is an ordinary hand-authored file (the docs/Batches decks,
 * a library export) and passes untouched. One that carries the stamp must match it
 * exactly, and its `formatVersion` must not be newer than the one this importer knows: a
 * newer version could be a shape `normalizeDeck` would parse but silently misread, so
 * refusing beats importing something wrong. Throws with a message the caller prints.
 */
function assertRefineryFormat(raw: unknown): void {
  if (Array.isArray(raw) || typeof raw !== "object" || raw === null) return;
  const meta = (raw as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return;
  const { format, formatVersion } = meta as { format?: unknown; formatVersion?: unknown };
  if (format === undefined) return;
  if (format !== REFINERY_FORMAT)
    throw new Error(
      `meta.format is "${String(format)}", expected "${REFINERY_FORMAT}" — this file was not written for KineMedia`,
    );
  if (typeof formatVersion === "number" && formatVersion > REFINERY_FORMAT_VERSION)
    throw new Error(
      `meta.formatVersion ${formatVersion} is newer than the ${REFINERY_FORMAT_VERSION} this importer knows; refusing rather than misreading it`,
    );
}

if (!source || argv.length !== 1 || (packAt !== -1 && !packName)) {
  console.error(USAGE);
  process.exitCode = 1;
} else if (staged && !packName) {
  console.error("--staged only applies with --pack <name>; the base catalog is always served.");
  process.exitCode = 1;
} else {
  try {
    const input = resolve(source);
    if ((await stat(input)).size > 100 * 1024 * 1024)
      throw new Error("Deck exceeds the 100 MiB import limit");
    const raw: unknown = JSON.parse(await readFile(input, "utf8"));
    // A stamped hand-off must be one this importer was written for, before anything reads
    // its shape. An unstamped file (hand-authored, library export) is not a hand-off and
    // passes straight through.
    assertRefineryFormat(raw);
    // Bare word arrays (the docs/Batches decks) go through the same toDeck cleanup
    // the library importer uses: ids, dedupe, level from the file name.
    const catalog = normalizeDeck(Array.isArray(raw) ? toDeck(raw, source) : raw);
    const revision = createHash("sha256")
      .update(JSON.stringify(catalog))
      .digest("hex")
      .slice(0, 24);
    const slug = packName ? packSlug(packName) : null;
    const output = fileURLToPath(
      new URL(
        slug
          ? locale
            ? `../src/features/vocabulary/data/${locale}/${slug}.json`
            : `../src/features/vocabulary/data/packs/${staged ? "incoming/" : ""}${slug}.json`
          : "../src/features/vocabulary/data/catalog.json",
        import.meta.url,
      ),
    );
    await mkdir(dirname(output), { recursive: true });
    // The old file remains intact if validation or writing fails. Rename is atomic here.
    const temporary = `${output}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ revision, ...catalog }, null, 2)}\n`, {
      flag: "wx",
    });
    await rename(temporary, output);
    console.log(
      slug
        ? staged
          ? `Staged pack "${slug}": ${catalog.count} words; revision ${revision} → data/packs/incoming/${slug}.json. Embedded and validated, but NOT served — move it into data/packs/ and rebuild/restart to display.`
          : `Compiled pack "${slug}": ${catalog.count} words; revision ${revision} → data/packs/${slug}.json. Restart dev / rebuild to serve.`
        : `Imported ${catalog.count} distinct words; revision ${revision}. Rebuild/deploy to publish.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Vocabulary import failed");
    process.exitCode = 1;
  }
}
