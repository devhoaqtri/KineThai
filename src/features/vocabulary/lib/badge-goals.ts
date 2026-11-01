/**
 * The badge ladders a reader climbs, and the plain words for what each badge asks.
 *
 * Three shelf sections: words in one day (the daily goals), days in a row (the streak),
 * and words learned — one ladder for a single CEFR/HSK level and one for a difficulty
 * track ("pack"), each the one the reader has taken furthest. Every ladder lists the rungs
 * already earned, lowest first, then only the very next one, so a reader always sees one
 * goal ahead and never the whole climb.
 *
 * The two short goals also repeat: meeting the 10-word day 5, 10 and 20 times, completing
 * a 3-day run 5 times, and a 7- or 10-day run 3 times each earn a badge of their own.
 *
 * Exports: BadgeGoal, BadgeRung, BadgeLadder, BadgeLadders, DAILY_REPEATS, STREAK_REPEATS,
 *   badgeLadders, earnedRepeatCount, badgeGoalRatio, badgeGoalCriteria, badgeGoalProgress
 * Depends on: ./level-progress, ./streak, ./word-badges, ./difficulty, ./daily-goal,
 *   ./target-language, ./locale
 */

import { formatLevelBand, tracksFor } from "./difficulty";
import {
  milestoneKey,
  milestonesReached,
  parseMilestoneKey,
  scopeProgress,
  type LevelProgress,
  type ProgressScope,
} from "./level-progress";
import type { Locale } from "./locale";
import type { VocabularyLevel } from "./schema";
import { DAY_MIN_WORDS, MILESTONES, STREAK_REPEATS, streakRunsCompleted } from "./streak";
import { DAILY_GOALS, type DailyGoal } from "./daily-goal";
import type { TargetLocale } from "./target-language";
import { ALL_SCOPE, scopeLabel } from "./word-badges";

/** A badge, earned or not, with where the reader stands on it. */
export type BadgeGoal =
  | { kind: "streak"; days: number; current: number }
  | { kind: "words"; scope: string; words: number; complete: boolean; seen: number }
  /** A daily goal: `times` days met so far, `today` words finished today. */
  | { kind: "daily"; goal: DailyGoal; times: number; today: number }
  /**
   * A short goal met `times` times: the daily goal of `base` words, or a run of `base`
   * days. `count` is how many times it has been met so far.
   */
  | { kind: "repeat"; of: "daily" | "streak"; base: number; times: number; count: number };

/** The daily goal that repeats, and how many days met earn each badge. */
export const DAILY_REPEATS = { goal: 10, times: [5, 10, 20] } as const;
export { STREAK_REPEATS };

/** One badge on a ladder: earned, or the single next one to aim for. */
export type BadgeRung = { goal: BadgeGoal; earned: boolean };

/** One scope's word ladder. */
export type BadgeLadder = { scope: string; rungs: BadgeRung[] };

/** The shelf's ladders, each its earned rungs lowest first, then the next one. */
export type BadgeLadders = {
  /** Words in one day: 10, 25, 50. */
  daily: BadgeRung[];
  /** Days in a row. */
  streak: BadgeRung[];
  /** The single level taken furthest, or null when the catalog has none. */
  level: BadgeLadder | null;
  /** The difficulty track taken furthest, or null when the catalog has none. */
  track: BadgeLadder | null;
};

/**
 * The scope taken furthest: the highest share seen among those not yet finished (a
 * finished one has no goal left to show), more words seen on a tie, then list order. Only
 * when every scope is finished does a finished one stand in.
 */
function furthest(
  scopes: readonly ProgressScope[],
  seen: LevelProgress,
  levelCounts: Partial<Record<VocabularyLevel, number>>,
): { scope: ProgressScope; seen: number; total: number } | null {
  const sized = scopes
    .map((scope) => ({ scope, ...scopeProgress(scope.levels, seen, levelCounts) }))
    .filter((entry) => entry.total > 0);
  const open = sized.filter((entry) => entry.seen < entry.total);
  const pool = open.length ? open : sized;
  let best: (typeof sized)[number] | null = null;
  for (const entry of pool) {
    if (
      !best ||
      entry.seen / entry.total > best.seen / best.total ||
      (entry.seen / entry.total === best.seen / best.total && entry.seen > best.seen)
    ) {
      best = entry;
    }
  }
  return best;
}

/**
 * @param input.daily Days each daily goal has been met, and words finished today
 * @param input.streakEarned Streak milestones already earned, in days
 * @param input.streakNow The current run, in days
 * @param input.streakDays Qualifying streak days, newest first
 * @param input.streakRepeats Run lengths whose repeat badge is saved as earned
 * @param input.wordEarned Word milestone keys already earned ("vo-long:200", "B1:100")
 * @param input.levelScopes One scope per single level
 * @param input.trackScopes One scope per difficulty track
 * @param input.seen Seen words per level
 * @param input.levelCounts Words per level in the catalog
 * @returns Every ladder; a finished one simply has no unearned rung
 * @pure true
 */
export function badgeLadders(input: {
  daily: { times: Record<DailyGoal, number>; today: number };
  streakEarned: readonly number[];
  streakNow: number;
  /** Qualifying streak days, newest first (StreakStore.days). */
  streakDays: readonly number[];
  /** Run lengths with their repeat badge saved (StreakStore.repeats). */
  streakRepeats: readonly number[];
  wordEarned: readonly string[];
  levelScopes: readonly ProgressScope[];
  trackScopes: readonly ProgressScope[];
  seen: LevelProgress;
  levelCounts: Partial<Record<VocabularyLevel, number>>;
}): BadgeLadders {
  const { times, today } = input.daily;
  const nextDaily = DAILY_GOALS.find((goal) => times[goal] === 0);
  const daily: BadgeRung[] = DAILY_GOALS.filter(
    (goal) => times[goal] > 0 || goal === nextDaily,
  ).map((goal) => ({
    goal: { kind: "daily", goal, times: times[goal], today },
    earned: times[goal] > 0,
  }));

  // Earned repeats, then the next one. Callers offer them only once the goal itself is met.
  const repeats = (
    of: "daily" | "streak",
    base: number,
    ladder: readonly number[],
    count: number,
  ) => {
    const rungs: BadgeRung[] = [];
    for (const times of ladder) {
      const goal: BadgeGoal = { kind: "repeat", of, base, times, count };
      rungs.push({ goal, earned: count >= times });
      if (count < times) break;
    }
    return rungs;
  };
  if (times[DAILY_REPEATS.goal] > 0) {
    daily.push(
      ...repeats("daily", DAILY_REPEATS.goal, DAILY_REPEATS.times, times[DAILY_REPEATS.goal]),
    );
  }

  const streakEarned = [...new Set(input.streakEarned)].sort((a, b) => a - b);
  const nextStreak = MILESTONES.find((days) => !streakEarned.includes(days));
  const streak: BadgeRung[] = streakEarned.map((days) => ({
    goal: { kind: "streak", days, current: days },
    earned: true,
  }));
  if (nextStreak !== undefined) {
    streak.push({
      goal: { kind: "streak", days: nextStreak, current: input.streakNow },
      earned: false,
    });
  }

  for (const [length, times] of Object.entries(STREAK_REPEATS)) {
    const base = Number(length);
    if (!streakEarned.includes(base)) continue;
    // A saved badge stays earned after the days that earned it have aged out.
    const runs = streakRunsCompleted(input.streakDays, base);
    const count = input.streakRepeats.includes(base) ? Math.max(runs, times) : runs;
    streak.push(...repeats("streak", base, [times], count));
  }

  const earnedWords = new Map<string, number[]>();
  for (const key of new Set(input.wordEarned)) {
    const parsed = parseMilestoneKey(key);
    if (parsed) {
      earnedWords.set(parsed.scope, [...(earnedWords.get(parsed.scope) ?? []), parsed.words]);
    }
  }
  const ladderOf = (scopes: readonly ProgressScope[]): BadgeLadder | null => {
    const pick = furthest(scopes, input.seen, input.levelCounts);
    if (!pick) return null;
    const scope = pick.scope.id;
    // A rung already passed counts even before it is recorded: the level scopes arrived
    // after many readers were well past their first hundreds, and are only recorded on the
    // next word read in that level.
    const reached = milestonesReached(scope, pick.seen, pick.total).map((rung) => rung.words);
    const passed = [...new Set([...(earnedWords.get(scope) ?? []), ...reached])].sort(
      (a, b) => a - b,
    );
    const rungs: BadgeRung[] = passed.map((words) => ({
      goal: { kind: "words", scope, words, complete: words === pick.total, seen: words },
      earned: true,
    }));
    const earned = new Set(passed.map((words) => milestoneKey({ scope, words })));
    // Every rung the scope has, finished or not: milestonesReached over the full size.
    const next = milestonesReached(scope, pick.total, pick.total).find(
      (rung) => !earned.has(milestoneKey(rung)),
    );
    if (next) rungs.push({ goal: { kind: "words", ...next, seen: pick.seen }, earned: false });
    return { scope, rungs };
  };

  return {
    daily,
    streak,
    level: ladderOf(input.levelScopes),
    track: ladderOf(input.trackScopes),
  };
}

/**
 * @param dailyMet Days the repeating daily goal has been met
 * @param streakRepeats Run lengths whose repeat badge is saved as earned
 * @returns Repeat badges earned, for the tab's count
 * @pure true
 */
export function earnedRepeatCount(dailyMet: number, streakRepeats: readonly number[]): number {
  return DAILY_REPEATS.times.filter((times) => dailyMet >= times).length + streakRepeats.length;
}

/** @returns How far the reader is towards a badge, 0 to 1. @pure true */
export function badgeGoalRatio(goal: BadgeGoal): number {
  const [now, target] =
    goal.kind === "daily"
      ? [goal.today, goal.goal]
      : goal.kind === "streak"
        ? [goal.current, goal.days]
        : goal.kind === "repeat"
          ? [goal.count, goal.times]
          : [goal.seen, goal.words];
  return target > 0 ? Math.min(1, Math.max(0, now / target)) : 0;
}

/** @returns What a badge asks of the reader, in one or two sentences. */
export function badgeGoalCriteria(
  goal: BadgeGoal,
  locale: TargetLocale,
  uiLocale: Locale = "vi",
): string {
  if (uiLocale === "ja") {
    if (goal.kind === "daily") {
      return `1日に異なる単語を ${goal.goal} 語最後まで学習します。達成した日ごとに回数が1つ増えます（連続でなくても構いません）。`;
    }
    if (goal.kind === "streak") {
      return `毎日少なくとも ${DAY_MIN_WORDS} 語を、${goal.days} 日連続で学習します。1日休むとカウントは最初からになります。`;
    }
    if (goal.kind === "repeat") {
      return goal.of === "daily"
        ? `1日に ${goal.base} 語の学習を ${goal.times} 回達成します。連続した日でなくても構いません。`
        : `${goal.base} 日連続を ${goal.times} 回達成します。長い連続記録は複数回として数えられます（${goal.base * 2} 日連続なら 2 回）。`;
    }
    const any = "同じ単語を何度見ても1語として数えられます。";
    if (goal.scope === ALL_SCOPE) {
      return goal.complete
        ? `すべてのレベルにわたって、デッキ内の全 ${goal.words} 語を学習します。${any}`
        : `レベルを問わず、異なる単語を ${goal.words} 語学習します。${any}`;
    }
    const track = tracksFor(locale).find((entry) => entry.id === goal.scope);
    const name = scopeLabel(goal.scope, locale, uiLocale);
    const band = track ? `（${formatLevelBand(track.levels)}）` : "";
    return goal.complete
      ? `${name}${band} の全 ${goal.words} 語を学習します。${any}`
      : `${name}${band} の異なる単語を ${goal.words} 語学習します。${any}`;
  }
  if (uiLocale === "th") {
    if (goal.kind === "daily") {
      return `เรียนคำศัพท์ที่ไม่ซ้ำกันครบ ${goal.goal} คำในหนึ่งวัน ทุกวันที่ทำได้ เหรียญจะนับเพิ่มหนึ่งครั้งโดยไม่จำเป็นต้องติดต่อกัน`;
    }
    if (goal.kind === "streak") {
      return `เรียนอย่างน้อยวันละ ${DAY_MIN_WORDS} คำ ติดต่อกัน ${goal.days} วัน หากเว้นหนึ่งวัน สถิติจะเริ่มนับใหม่`;
    }
    if (goal.kind === "repeat") {
      return goal.of === "daily"
        ? `เรียนครบ ${goal.base} คำในหนึ่งวัน จำนวน ${goal.times} ครั้ง ไม่จำเป็นต้องเป็นวันติดกัน`
        : `ทำสถิติต่อเนื่อง ${goal.base} วันให้ครบ ${goal.times} ครั้ง สถิติยาวนับได้หลายครั้ง: ${goal.base * 2} วันติดกันนับเป็น 2 ครั้ง`;
    }
    const any = "แต่ละคำนับเพียงครั้งเดียวไม่ว่าจะเจอกี่ครั้งก็ตาม";
    if (goal.scope === ALL_SCOPE) {
      return goal.complete
        ? `ดูคำศัพท์ครบทั้งหมด ${goal.words} คำในชุด ทุกระดับ ${any}`
        : `ดูคำศัพท์ที่ไม่ซ้ำกันครบ ${goal.words} คำ ในระดับใดก็ได้ ${any}`;
    }
    const track = tracksFor(locale).find((entry) => entry.id === goal.scope);
    const name = scopeLabel(goal.scope, locale, uiLocale);
    const band = track ? ` (${formatLevelBand(track.levels)})` : "";
    return goal.complete
      ? `ดูคำศัพท์ครบทั้งหมด ${goal.words} คำของ ${name}${band} ${any}`
      : `ดูคำศัพท์ที่ไม่ซ้ำกันครบ ${goal.words} คำใน ${name}${band} ${any}`;
  }
  if (goal.kind === "daily") {
    return `Học xong ${goal.goal} từ khác nhau trong một ngày. Mỗi ngày đạt được, huy hiệu đếm thêm một lần — không cần liền nhau.`;
  }
  if (goal.kind === "streak") {
    return `Học ít nhất ${DAY_MIN_WORDS} từ mỗi ngày, ${goal.days} ngày liền nhau. Bỏ một ngày, chuỗi sẽ bắt đầu lại từ đầu.`;
  }
  if (goal.kind === "repeat") {
    return goal.of === "daily"
      ? `Học xong ${goal.base} từ trong một ngày, ${goal.times} lần. Các ngày không cần liền nhau.`
      : `Hoàn thành chuỗi ${goal.base} ngày liền, ${goal.times} lần. Một chuỗi dài được tính nhiều lần: ${goal.base * 2} ngày liền là 2 lần.`;
  }
  const any = "Mỗi từ chỉ tính một lần, dù bạn gặp lại bao nhiêu lần.";
  if (goal.scope === ALL_SCOPE) {
    return goal.complete
      ? `Xem hết toàn bộ ${goal.words} từ trong bộ, ở mọi trình độ. ${any}`
      : `Xem ${goal.words} từ khác nhau, ở bất kỳ trình độ nào. ${any}`;
  }
  const track = tracksFor(locale).find((entry) => entry.id === goal.scope);
  const name = scopeLabel(goal.scope, locale, "vi");
  const band = track ? ` (${formatLevelBand(track.levels)})` : "";
  return goal.complete
    ? `Xem hết ${goal.words} từ của ${name}${band}. ${any}`
    : `Xem ${goal.words} từ khác nhau thuộc ${name}${band}. ${any}`;
}

/** @returns Where the reader stands on a badge: "Chuỗi hiện tại: 2 ngày", "Đã xem: 37/100 từ". */
export function badgeGoalProgress(goal: BadgeGoal, uiLocale: Locale = "vi"): string {
  if (uiLocale === "ja") {
    if (goal.kind === "daily") {
      const today = `今日: ${Math.min(goal.today, goal.goal)}/${goal.goal} 語`;
      return goal.times > 0 ? `${goal.times} 回達成 · ${today}` : today;
    }
    if (goal.kind === "repeat") return `達成: ${Math.min(goal.count, goal.times)}/${goal.times} 回`;
    if (goal.kind === "streak")
      return `現在の連続記録: ${Math.min(goal.current, goal.days)}/${goal.days} 日`;
    return `学習済み: ${Math.min(goal.seen, goal.words)}/${goal.words} 語`;
  }
  if (uiLocale === "th") {
    if (goal.kind === "daily") {
      const today = `วันนี้: ${Math.min(goal.today, goal.goal)}/${goal.goal} คำ`;
      return goal.times > 0 ? `ทำได้แล้ว ${goal.times} ครั้ง · ${today}` : today;
    }
    if (goal.kind === "repeat")
      return `ทำได้แล้ว: ${Math.min(goal.count, goal.times)}/${goal.times} ครั้ง`;
    if (goal.kind === "streak")
      return `สถิติปัจจุบัน: ${Math.min(goal.current, goal.days)}/${goal.days} วัน`;
    return `ดูแล้ว: ${Math.min(goal.seen, goal.words)}/${goal.words} คำ`;
  }
  if (goal.kind === "daily") {
    const today = `Hôm nay: ${Math.min(goal.today, goal.goal)}/${goal.goal} từ`;
    return goal.times > 0 ? `Đã đạt ${goal.times} lần · ${today}` : today;
  }
  if (goal.kind === "repeat")
    return `Đã đạt: ${Math.min(goal.count, goal.times)}/${goal.times} lần`;
  if (goal.kind === "streak")
    return `Chuỗi hiện tại: ${Math.min(goal.current, goal.days)}/${goal.days} ngày`;
  return `Đã xem: ${Math.min(goal.seen, goal.words)}/${goal.words} từ`;
}
