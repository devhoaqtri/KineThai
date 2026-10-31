/**
 * Guard: the rule that takes a word out of the feed.
 *
 * This one is worth asserting rather than eyeballing, because both ways of getting it
 * wrong are bad and neither is visible in normal use: too eager and a handful of taps from
 * one source can pull a correct word out of circulation until an admin returns; too lax and
 * a genuinely broken entry keeps being shown to everyone after readers have said so.
 *
 * Run: npx tsx scripts/check-word-block.ts
 */
import assert from "node:assert/strict";
import {
  BLOCK_AFTER_DISTINCT_REPORTERS as N,
  BLOCK_AFTER_SEVERE_REPORTERS as SEVERE,
  countDistinctReporters,
  getBlockDigest,
  getBlockedByLocale,
  getBlockedWordIds as blockedIn,
  type WordReportSignal,
} from "../src/features/vocabulary/lib/word-block";

const checks: string[] = [];
function check(label: string, passed: boolean, detail?: unknown) {
  checks.push(`${passed ? "OK  " : "FAIL"}  ${label}`);
  if (!passed) {
    process.exitCode = 1;
    if (detail !== undefined) console.error("      ", detail);
  }
}

const open = (
  wordId: string,
  reporter: string | null,
  { severe = false, locale = "en" } = {},
): WordReportSignal => ({ locale, wordId, reporter, severe, status: "new" });
const resolved = (wordId: string, reporter: string | null): WordReportSignal => ({
  ...open(wordId, reporter),
  status: "resolved",
});
const getBlockedWordIds = (reports: readonly WordReportSignal[]) => blockedIn(reports, "en");

assert.ok(N >= 2, "a threshold below two would let one reader block a word outright");
assert.ok(SEVERE >= 2, "a threshold below two would let one reader block a word outright");
assert.ok(SEVERE < N, "a severe report exists to hide a word sooner than an ordinary one");

// ── One reader is one opinion, however many times they tap ──────────────────────────────
{
  const many = Array.from({ length: N * 4 }, () => open("agree", "reporter-a"));
  check(
    `${N * 4} reports from ONE reader do not block (${countDistinctReporters(many, "agree", "en")} distinct)`,
    getBlockedWordIds(many).size === 0,
  );
}

// ── The threshold itself, from both sides ───────────────────────────────────────────────
{
  const below = Array.from({ length: N - 1 }, (_, i) => open("allow", `reporter-${i}`));
  const at = Array.from({ length: N }, (_, i) => open("allow", `reporter-${i}`));
  check(`${N - 1} separate readers do not block`, !getBlockedWordIds(below).has("allow"));
  check(`${N} separate readers do block`, getBlockedWordIds(at).has("allow"));
}

// ── An unidentifiable reporter never counts ─────────────────────────────────────────────
//
// Several nulls cannot be shown to be different readers. Counting them would mean a single
// source behind a proxy that strips the address could block any word on its own.
{
  const nulls = Array.from({ length: N * 3 }, () => open("weep", null));
  check(`${N * 3} reports with no reporter key do not block`, getBlockedWordIds(nulls).size === 0);
  const mixed = [
    ...Array.from({ length: N - 1 }, (_, i) => open("weep", `r${i}`)),
    open("weep", null),
  ];
  check("a null does not top up a count that is one short", !getBlockedWordIds(mixed).has("weep"), [
    ...getBlockedWordIds(mixed),
  ]);
}

// ── Admin verification lifts the block ──────────────────────────────────────────────────
{
  const reports = Array.from({ length: N }, (_, i) => open("secret", `reporter-${i}`));
  check("blocked while the reports are open", getBlockedWordIds(reports).has("secret"));
  const after = reports.map((r) => resolved(r.wordId, r.reporter));
  check("returns once an admin resolves them", !getBlockedWordIds(after).has("secret"));
  const partly = [resolved("secret", "reporter-0"), ...reports.slice(1)];
  check(
    "resolving one of them is enough to drop below the threshold",
    !getBlockedWordIds(partly).has("secret"),
  );
}

// ── Words do not bleed into each other ──────────────────────────────────────────────────
{
  const spread = [
    ...Array.from({ length: N }, (_, i) => open("lend", `r${i}`)),
    ...Array.from({ length: N - 1 }, (_, i) => open("refuse", `r${i}`)),
  ];
  const blocked = getBlockedWordIds(spread);
  check(
    "only the word that crossed the line is blocked",
    blocked.has("lend") && blocked.size === 1,
    [...blocked],
  );
}

// ── A severe reason hides a word sooner ─────────────────────────────────────────────────
{
  const severe = { severe: true };
  const below = Array.from({ length: SEVERE - 1 }, (_, i) => open("slur", `r${i}`, severe));
  const at = Array.from({ length: SEVERE }, (_, i) => open("slur", `r${i}`, severe));
  check(`${SEVERE - 1} severe reader does not block`, !getBlockedWordIds(below).has("slur"));
  check(`${SEVERE} severe readers do block`, getBlockedWordIds(at).has("slur"));
  check(
    `${SEVERE} ordinary readers do not block`,
    N <= SEVERE || !getBlockedWordIds(at.map((r) => ({ ...r, severe: false }))).has("slur"),
  );
  const repeat = Array.from({ length: SEVERE * 4 }, () => open("slur", "same", severe));
  check("one reader repeating a severe report does not block", !getBlockedWordIds(repeat).size);
  const mixed = [
    open("slur", "severe-reader", severe),
    ...Array.from({ length: N - 1 }, (_, i) => open("slur", `r${i}`)),
  ];
  check(`${N} readers block whatever each of them said`, getBlockedWordIds(mixed).has("slur"));
  const nulls = Array.from({ length: SEVERE * 3 }, () => open("slur", null, severe));
  check("severe reports with no reporter key do not block", !getBlockedWordIds(nulls).size);
}

// ── A language never hides a word in another one ───────────────────────────────────────
{
  const german = Array.from({ length: N }, (_, i) => open("budget", `r${i}`, { locale: "de" }));
  const blocked = getBlockedByLocale(german);
  check("the language that reported it loses the word", blocked.get("de")?.has("budget") === true);
  check("another deck with the same id keeps its word", !blocked.has("fr") && !blocked.has("en"));
  const split = [
    ...Array.from({ length: N - 1 }, (_, i) => open("budget", `r${i}`, { locale: "de" })),
    open("budget", "other", { locale: "fr" }),
  ];
  check("readers in two languages do not add up", getBlockedByLocale(split).size === 0);
  check(
    "readers are counted within one language",
    countDistinctReporters(split, "budget", "de") === N - 1,
  );
}

// ── The digest drives cursor invalidation, so it must behave ────────────────────────────
{
  check("an empty blocklist leaves the revision alone", getBlockDigest(new Set()) === "");
  const a = getBlockDigest(new Set(["x", "y"]));
  const b = getBlockDigest(new Set(["y", "x"]));
  check("the digest does not depend on order", a === b, { a, b });
  check(
    "a different blocklist gives a different digest",
    a !== getBlockDigest(new Set(["x", "z"])),
  );
  check(
    "a longer blocklist gives a different digest",
    a !== getBlockDigest(new Set(["x", "y", "z"])),
  );
}

console.log(checks.join("\n"));
if (process.exitCode) console.error("\nword block guard FAILED");
else console.log(`\n${checks.length} word-block assertions passed`);
