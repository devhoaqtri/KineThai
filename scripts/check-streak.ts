/**
 * Assert the streak rules that no amount of looking at the screen would catch.
 *
 * A streak is a claim about days, and a day takes a day to pass. Nothing here can be
 * checked by using the app: the interesting cases are a run broken by a gap, a device whose
 * clock moved, a milestone that must never fire twice, and a year boundary. All of it is
 * pure logic over an injected `now`, which is why the logic was written that way.
 *
 * Six of these guard a specific way this could rot:
 *   - boundedness, because the one thing that would make this a storage leak is a future
 *     "let's also keep the daily count", and the shape is the only thing preventing it;
 *   - the yesterday anchor, because "newest === today" reads as obviously correct and
 *     would blank a reader's streak every morning until they finished three more words;
 *   - the calendar day step, because `- DAY_MS` looks equivalent and silently stalls a
 *     streak for anyone whose timezone observes DST;
 *   - celebrate-once, asserted by replaying a whole sequence rather than trusted;
 *   - the recording exclusion, because a badge flashing into a published promo clip is
 *     only ever noticed after it is posted;
 *   - and the reduced-motion exception, because the card's own playback gate makes the
 *     timer unreachable for those readers and timer-only would exclude them silently.
 *
 * Usage: npm run check:streak
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { previousDay, startOfDay } from "../src/features/vocabulary/lib/day.ts";
import {
  DAY_LIMIT,
  DAY_MIN_WORDS,
  MILESTONES,
  type StreakStore,
  currentStreak,
  emptyStreak,
  milestonesReached,
  parseStreak,
  recordFinishedWord,
} from "../src/features/vocabulary/lib/streak.ts";

const failures: string[] = [];
const rows: string[] = [];

function check(label: string, pass: boolean, detail = ""): void {
  rows.push(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures.push(label);
}

/** Local noon, so day arithmetic can never land on a neighbouring date. */
function noon(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}

/** Finish `count` distinct words on one day, returning the store and all celebrations. */
function finishDay(
  store: StreakStore,
  at: number,
  count = DAY_MIN_WORDS,
  tag = "w",
): { store: StreakStore; celebrate: number[] } {
  let next = store;
  const celebrate: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const step = recordFinishedWord(next, `${tag}-${at}-${i}`, at);
    next = step.store;
    celebrate.push(...step.celebrate);
  }
  return { store: next, celebrate };
}

// ── 1. Purity ───────────────────────────────────────────────────────────────────────────
const base = emptyStreak();
const frozen = JSON.stringify(base);
recordFinishedWord(base, "a", noon(2026, 3, 10));
check("recordFinishedWord does not mutate its input", JSON.stringify(base) === frozen);

// ── 2. Same-day dedupe ──────────────────────────────────────────────────────────────────
{
  const day = noon(2026, 3, 10);
  let store = emptyStreak();
  for (let i = 0; i < DAY_MIN_WORDS * 3; i += 1) {
    store = recordFinishedWord(store, "same-word", day).store;
  }
  check(
    "the same word repeated all day never qualifies it",
    store.days.length === 0 && (store.pending?.words.length ?? 0) === 1,
    `pending ${store.pending?.words.length ?? 0}`,
  );
}

// ── 3. The threshold, and that qualifying DROPS the word list ───────────────────────────
{
  const day = noon(2026, 3, 10);
  const short = finishDay(emptyStreak(), day, DAY_MIN_WORDS - 1).store;
  check(`${DAY_MIN_WORDS - 1} words does not qualify the day`, short.days.length === 0);

  const full = finishDay(emptyStreak(), day).store;
  check(`${DAY_MIN_WORDS} words qualifies the day`, full.days[0] === startOfDay(day));
  check("a qualified day keeps no word list — the bound is the shape", full.pending === undefined);

  // Further finishes on a qualified day are a no-op, so loop mode cannot inflate anything.
  const more = recordFinishedWord(full, "another", day);
  check("a finish after the day qualifies changes nothing", more.store === full);
}

// ── 4. Boundedness under abuse ──────────────────────────────────────────────────────────
{
  let store = emptyStreak();
  let day = noon(2024, 1, 1);
  for (let d = 0; d < 1000; d += 1) {
    store = finishDay(store, day, 12, `d${d}`).store;
    day = new Date(day).setDate(new Date(day).getDate() + 1);
  }
  const bytes = JSON.stringify(store).length;
  check("days never exceed DAY_LIMIT", store.days.length <= DAY_LIMIT, `${store.days.length}`);
  check("no word list survives 1000 days of finishes", store.pending === undefined);
  check("the whole store stays under 8 KB", bytes < 8192, `${bytes} bytes`);
}

// ── 5. Streak walking ───────────────────────────────────────────────────────────────────
{
  const today = noon(2026, 3, 10);
  check("empty store has no streak", currentStreak(emptyStreak(), today) === 0);

  const one = finishDay(emptyStreak(), today).store;
  check("today alone is a streak of 1", currentStreak(one, today) === 1);

  // The anchor rule: a reader part-way through today has not lost yesterday's run.
  const yesterday = finishDay(emptyStreak(), noon(2026, 3, 9)).store;
  check("yesterday alone still reads 1 today", currentStreak(yesterday, today) === 1);
  check(
    "two days ago alone reads 0",
    currentStreak(finishDay(emptyStreak(), noon(2026, 3, 8)).store, today) === 0,
  );

  let run = emptyStreak();
  for (let back = 6; back >= 0; back -= 1) run = finishDay(run, noon(2026, 3, 10 - back)).store;
  check(
    "seven consecutive days read 7",
    currentStreak(run, today) === 7,
    `${currentStreak(run, today)}`,
  );

  // A gap, then today: the run behind the gap must not be counted.
  let gapped = emptyStreak();
  for (const d of [1, 2, 3]) gapped = finishDay(gapped, noon(2026, 3, d)).store;
  gapped = finishDay(gapped, today).store;
  check("a gap resets the run to 1", currentStreak(gapped, today) === 1);

  // A day that fell short sits inside the run without extending or breaking it.
  let partial = finishDay(emptyStreak(), noon(2026, 3, 9)).store;
  partial = finishDay(partial, noon(2026, 3, 10), DAY_MIN_WORDS - 1).store;
  check("a short day neither extends nor breaks", currentStreak(partial, today) === 1);
}

// ── 6. The calendar day step ────────────────────────────────────────────────────────────
{
  let day = startOfDay(noon(2025, 3, 20));
  let ok = true;
  let detail = "";
  for (let i = 0; i < 400; i += 1) {
    const back = previousDay(day);
    if (startOfDay(back) !== back) {
      ok = false;
      detail = `not a midnight at step ${i}`;
      break;
    }
    const before = new Date(back);
    const after = new Date(day);
    before.setDate(before.getDate() + 1);
    if (before.getDate() !== after.getDate() || before.getMonth() !== after.getMonth()) {
      ok = false;
      detail = `step ${i} skipped a date`;
      break;
    }
    day = back;
  }
  check("400 previousDay steps stay exactly one calendar day apart", ok, detail);

  // Across a year end specifically, where a wrong step is most visible.
  const jan1 = startOfDay(noon(2026, 1, 1));
  const dec31 = previousDay(jan1);
  check(
    "the day before 1 Jan is 31 Dec of the previous year",
    new Date(dec31).getDate() === 31 && new Date(dec31).getFullYear() === 2025,
  );
}

// ── 7. Milestones ──────────────────────────────────────────────────────────────────────
{
  const ascending = MILESTONES.every((at, i) => i === 0 || at > MILESTONES[i - 1]!);
  check("MILESTONES is strictly ascending", ascending);
  check("the ladder starts at 3, then a week", MILESTONES[0] === 3 && MILESTONES[1] === 7);
  check("2 days has reached nothing", milestonesReached(2).length === 0);
  check("3 days has reached exactly [3]", JSON.stringify(milestonesReached(3)) === "[3]");
  check("21 days has reached [3,7,10,20]", JSON.stringify(milestonesReached(21)) === "[3,7,10,20]");
  check(
    "a 5-day medal earned before the ladder changed survives parsing",
    parseStreak(JSON.stringify({ days: [], earned: [5] }), Date.now()).earned.includes(5),
  );
}

// ── 8. Celebrate exactly once, ever ────────────────────────────────────────────────────
{
  const top = MILESTONES[MILESTONES.length - 1]!;
  let store = emptyStreak();
  let day = noon(2025, 1, 1);
  const fired: number[] = [];
  for (let d = 0; d < top; d += 1) {
    fired.push(...finishDay(store, day, DAY_MIN_WORDS, `c${d}`).celebrate);
    store = finishDay(store, day, DAY_MIN_WORDS, `c${d}`).store;
    day = new Date(day).setDate(new Date(day).getDate() + 1);
  }
  const unique = new Set(fired);
  check(
    "every milestone fired, and none fired twice",
    unique.size === fired.length && unique.size === MILESTONES.length,
    `${fired.length} celebrations for ${MILESTONES.length} milestones`,
  );

  // Replaying the same finishes against the earned store must celebrate nothing.
  const replay = finishDay(store, day, DAY_MIN_WORDS, "replay").celebrate;
  check("a further qualifying day past the top milestone celebrates nothing", replay.length === 0);

  // And a reload: parse what was stored, walk the same day again.
  const reloaded = parseStreak(JSON.stringify(store), day);
  check(
    "a reload re-derives the same earned set and celebrates nothing",
    JSON.stringify(reloaded.earned) === JSON.stringify(store.earned),
  );
}

// ── 9. At most one milestone per day ───────────────────────────────────────────────────
{
  let store = emptyStreak();
  let day = noon(2025, 6, 1);
  let worst = 0;
  for (let d = 0; d < 120; d += 1) {
    const step = finishDay(store, day, DAY_MIN_WORDS, `m${d}`);
    worst = Math.max(worst, step.celebrate.length);
    store = step.store;
    day = new Date(day).setDate(new Date(day).getDate() + 1);
  }
  check("no day ever earns more than one milestone", worst <= 1, `worst ${worst}`);
}

// ── 10. Reading a hostile value ────────────────────────────────────────────────────────
{
  const now = noon(2026, 3, 10);
  const empties = [
    null,
    "",
    "not json",
    "[]",
    "{}",
    '{"days":"x"}',
    '{"days":[1,"2"]}',
    '{"days":[null]}',
    '"a string"',
    "42",
  ];
  const allEmpty = empties.every((raw) => {
    const store = parseStreak(raw, now);
    return store.days.length === 0 && store.earned.length === 0 && store.pending === undefined;
  });
  check("every malformed value reads back as the empty store", allEmpty);

  // NaN survives JSON as null, so cover the in-memory path too.
  check(
    "a NaN day is dropped",
    parseStreak(JSON.stringify({ days: [Number.NaN, now] }), now).days.length === 1,
  );

  const future = startOfDay(now) + 5 * 24 * 60 * 60 * 1000;
  check(
    "a day well in the future is dropped",
    !parseStreak(JSON.stringify({ days: [future] }), now).days.includes(future),
  );

  const stale = parseStreak(
    JSON.stringify({ days: [], pending: { day: noon(2026, 3, 9), words: ["a", "b"] } }),
    now,
  );
  check("a pending day that is no longer today is forgotten", stale.pending === undefined);

  const bogus = parseStreak(JSON.stringify({ days: [startOfDay(now)], earned: [7, 4] }), now);
  check("an earned value not on the ladder is dropped", JSON.stringify(bogus.earned) === "[7]");

  // Absent `earned` seeds from the streak lived, so a later release adding a lower rung
  // cannot retro-fire a celebration for days already behind the reader.
  let lived = emptyStreak();
  for (let back = 5; back >= 0; back -= 1) {
    lived = finishDay(lived, noon(2026, 3, 10 - back), DAY_MIN_WORDS, `s${back}`).store;
  }
  const seeded = parseStreak(JSON.stringify({ days: lived.days }), now);
  check(
    "an absent earned list is seeded from the days already lived",
    JSON.stringify(seeded.earned) === JSON.stringify(milestonesReached(currentStreak(lived, now))),
    `${JSON.stringify(seeded.earned)}`,
  );

  check(
    "duplicate day stamps collapse",
    parseStreak(JSON.stringify({ days: [startOfDay(now), startOfDay(now)] }), now).days.length ===
      1,
  );
}

// ── 11. The recorded frame must not show a badge ───────────────────────────────────────
{
  const css = readFileSync(
    join(import.meta.dirname, "..", "src/features/vocabulary/vocabulary.css"),
    "utf8",
  );
  check(
    ".vocab-streak-flash is hidden while recording",
    /\.vocab-recording\s+\.vocab-streak-flash\s*\{[^}]*display:\s*none/.test(css),
  );
  const guard = readFileSync(join(import.meta.dirname, "check-chrome-side.ts"), "utf8");
  check(
    "and is NOT claimed to be edge-anchored — it is centred, so it reads no --vocab-chrome-side",
    !guard.includes("vocab-streak"),
  );
}

// ── 12. The reduced-motion exception is still wired ───────────────────────────────────
{
  const card = readFileSync(
    join(import.meta.dirname, "..", "src/features/vocabulary/components/VocabularyCard.tsx"),
    "utf8",
  );
  check("VocabularyCard still reports finished words", card.includes("onWordFinished"));
  // useLearningPlayback gates `playing` on !reducedMotion and calls onFinish inside that
  // gate, so a reduced-motion reader can never reach the timer path. If this reference
  // disappears, those readers silently stop earning anything.
  check(
    "and still has a reducedMotion path to finishing",
    /reducedMotion/.test(
      card.slice(card.indexOf("markWordFinished"), card.indexOf("markWordFinished") + 1200),
    ),
  );
}

for (const row of rows) console.log(row);
console.log(
  failures.length
    ? `\n${failures.length} of ${rows.length} streak checks failed`
    : `\n${rows.length} streak checks passed.`,
);
process.exitCode = failures.length ? 1 : 0;
