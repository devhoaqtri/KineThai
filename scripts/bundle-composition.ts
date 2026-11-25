/**
 * What the browser's main script is made of: its bytes attributed to npm packages and app
 * folders through the build's source map, biggest first, plus its gzip size.
 *
 * The main script is the largest file every page waits for before its first paint, so this
 * is the number to watch when moving code out of it (docs/first-load-bundle-handoff.md).
 *
 * Run: npx vite build --sourcemap && npx tsx scripts/bundle-composition.ts [--top 30]
 * Without --sourcemap the build has no maps and the script says so.
 *
 * Depends on: node:fs, node:zlib (no dependencies)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const ASSETS = resolve(import.meta.dirname, "../.output/public/assets");
const topArg = process.argv.indexOf("--top");
const TOP = topArg > 0 ? Number(process.argv[topArg + 1]) : 30;

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decode one base64 VLQ segment of a source map's `mappings`. */
function decodeSegment(segment: string): number[] {
  const out: number[] = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    let digit = BASE64.indexOf(char);
    const more = digit & 32;
    digit &= 31;
    value += digit << shift;
    if (more) {
      shift += 5;
    } else {
      out.push(value & 1 ? -(value >> 1) : value >> 1);
      value = 0;
      shift = 0;
    }
  }
  return out;
}

/** The main script: the largest index-*.js, the entry every page loads. */
function mainScript(): string {
  const candidates = readdirSync(ASSETS)
    .filter((name) => /^index-.*\.js$/.test(name))
    .map((name) => ({ name, size: statSync(join(ASSETS, name)).size }))
    .sort((a, b) => b.size - a.size);
  if (!candidates.length) throw new Error(`no index-*.js in ${ASSETS}; build first`);
  return join(ASSETS, candidates[0]!.name);
}

/** A source path as the group it belongs to: an npm package or an app folder. */
function groupOf(source: string): string {
  const path = source.replace(/^(\.\.\/)+/, "");
  const pkg = /node_modules\/(@[^/]+\/[^/]+|[^/]+)/.exec(path);
  if (pkg) return `package ${pkg[1]}`;
  const app = /src\/(features\/[^/]+|routes\/_authenticated|routes\/admin|[^/]+)/.exec(path);
  return `app ${app ? app[1] : path}`;
}

const file = mainScript();
let map: { sources: string[]; mappings: string };
try {
  map = JSON.parse(readFileSync(`${file}.map`, "utf8"));
} catch {
  throw new Error(`${file}.map is missing: build with \`npx vite build --sourcemap\``);
}
const code = readFileSync(file, "utf8");
const lines = code.split("\n");
const bytes = new Map<string, number>();
let sourceIndex = 0;
map.mappings.split(";").forEach((line, lineIndex) => {
  if (!line) return;
  let column = 0;
  const segments: { column: number; source: number | null }[] = [];
  for (const raw of line.split(",")) {
    const fields = decodeSegment(raw);
    column += fields[0] ?? 0;
    if (fields.length > 1) sourceIndex += fields[1]!;
    segments.push({ column, source: fields.length > 1 ? sourceIndex : null });
  }
  const length = lines[lineIndex]?.length ?? 0;
  segments.forEach((segment, index) => {
    if (segment.source === null) return;
    const end = segments[index + 1]?.column ?? length;
    const group = groupOf(map.sources[segment.source] ?? "?");
    bytes.set(group, (bytes.get(group) ?? 0) + (end - segment.column));
  });
});

const kb = (n: number) => `${(n / 1024).toFixed(1).padStart(7)} KB`;
console.log(`${file.split("/").pop()}: ${kb(code.length)} raw, ${kb(gzipSync(code).length)} gzip`);
for (const [group, size] of [...bytes].sort((a, b) => b[1] - a[1]).slice(0, TOP)) {
  console.log(`${kb(size)}  ${group}`);
}
