/**
 * Guard: the export route's contract, which something outside this repo depends on.
 *
 * /export/$code exists so a scheduled job can record one word without driving Export
 * Studio's UI. That makes its surface published: the phase names, the stage attribute and
 * the start event are what a recorder waits on, and renaming one breaks a job that nobody
 * is watching, at whatever hour it runs.
 *
 * This asserts the contract's shape and that every word is addressable. Whether the page
 * actually reaches `done` is a browser question, checked by driving it (see the route's
 * own doc comment) rather than here.
 *
 * Run: npx tsx scripts/check-export-frame.ts
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EXPORT_CONTRACT } from "../src/features/vocabulary/lib/export-contract";
import { EXPORT_PRESETS, getExportPreset } from "../src/features/vocabulary/lib/export-presets";
import { isShareCode, normalizeShareCode } from "../src/features/vocabulary/lib/share-code";

const checks: string[] = [];
function check(label: string, passed: boolean, detail?: unknown) {
  checks.push(`${passed ? "OK  " : "FAIL"}  ${label}`);
  if (!passed) {
    process.exitCode = 1;
    if (detail !== undefined) console.error("      ", detail);
  }
}

// ── The published names ─────────────────────────────────────────────────────────────────
// Spelled out literally. If one changes, this fails and whoever changed it has to go and
// change the recorder too — which is the whole point of writing them down twice.
check(
  "phases are the four a driver waits on, plus missing",
  JSON.stringify(EXPORT_CONTRACT.phases) ===
    JSON.stringify(["loading", "ready", "playing", "done", "missing"]),
  EXPORT_CONTRACT.phases,
);
check(
  "the stage attribute is data-export-stage",
  EXPORT_CONTRACT.stageAttribute === "data-export-stage",
);
check("the start event is vocab-export-start", EXPORT_CONTRACT.startEvent === "vocab-export-start");

// ── The route exists, is addressed by code, and is not indexable ────────────────────────
{
  const route = readFileSync("src/routes/export.$code.tsx", "utf8");
  check("the route is /export/$code", route.includes('createFileRoute("/export/$code")'));
  check("it is noindex", /noindex/.test(route), "a recorder surface must not be crawled");
  check("it validates its search params", route.includes("validateSearch"));
  check(
    "it answers 404 outside the dev server",
    route.includes("if (!import.meta.env.DEV) throw notFound()"),
  );
  check(
    "its page loads only on the dev server",
    /component: import\.meta\.env\.DEV\s*\?\s*lazyRouteComponent/.test(route) &&
      !/^import .*ExportFramePage/m.test(route),
  );
}

// ── Presets a job can ask for ───────────────────────────────────────────────────────────
{
  const vertical = EXPORT_PRESETS.filter((p) => p.height > p.width);
  check(`there is a vertical preset for TikTok/Reels (${vertical.length})`, vertical.length > 0);
  check(
    "every preset has a real pixel size",
    EXPORT_PRESETS.every((p) => p.width > 0 && p.height > 0),
  );
  check(
    "an unknown preset id falls back rather than throwing",
    getExportPreset("no-such-preset").width > 0,
  );
}

// ── Every published word is addressable by the URL the job builds ───────────────────────
{
  const DATA = "src/features/vocabulary/data";
  const deckDirs = ["packs", "zh", "ko", "ja", "fr", "de", "es"].filter((dir) =>
    existsSync(join(DATA, dir)),
  );
  const files = [
    join(DATA, "catalog.json"),
    ...deckDirs.flatMap((dir) =>
      readdirSync(join(DATA, dir))
        .filter((f) => f.endsWith(".json"))
        .map((f) => join(DATA, dir, f)),
    ),
  ];
  let total = 0;
  const unaddressable: string[] = [];
  for (const file of files) {
    for (const word of (JSON.parse(readFileSync(file, "utf8")).words ?? []) as {
      word?: string;
      shareCode?: string;
    }[]) {
      total += 1;
      const code = (word.shareCode ?? "").trim();
      if (!code || !isShareCode(code) || normalizeShareCode(code) !== code) {
        unaddressable.push(`${file}  ${String(word.word)}  ${JSON.stringify(code)}`);
      }
    }
  }
  assert.ok(total > 0, "no words were read; this guard would pass vacuously");
  check(
    `all ${total} published words can be addressed as /export/<code>`,
    unaddressable.length === 0,
    unaddressable.slice(0, 5),
  );
}

console.log(checks.join("\n"));
if (process.exitCode) console.error("\nexport frame guard FAILED");
else console.log(`\n${checks.length} export-frame assertions passed`);
