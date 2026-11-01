/**
 * This device's saved words, filed instead of dumped. Two tabs say which reaction put a
 * word here (bookmarks / hearts), a switch files them by the day they were saved or by
 * CEFR level, and any group longer than FOLDER_CAP words splits into collapsible folders.
 *
 * Rows carry no reaction buttons and no emoji strip: the page is for reading words you
 * kept, so removing one is a swipe or a long-press on the row, with an undo bar in case
 * the gesture was a mistake. Only the English example sentence is shown — the Vietnamese
 * gloss is already the definition line above it.
 *
 * Exports: BookmarksPage
 * Depends on: router Link, lucide icons, useSavedWords, saved-groups, i18n labels, vocabulary.css
 */

import { useStreakBadges } from "../hooks/useStreakBadges";
import { useWordBadges, type EarnedWordBadge } from "../hooks/useWordBadges";
import { progressScopes, scopeKind, scopeLabel, wordTier } from "../lib/word-badges";
import {
  badgeGoalCriteria,
  badgeGoalProgress,
  badgeGoalRatio,
  badgeLadders,
  DAILY_REPEATS,
  earnedRepeatCount,
  type BadgeGoal,
  type BadgeLadder,
  type BadgeRung,
} from "../lib/badge-goals";
import { readProgress } from "../lib/level-progress";
import { currentStreak, readStreak } from "../lib/streak";
import { DEFAULT_TARGET, resolveTarget, type TargetLocale } from "../lib/target-language";
import {
  dailyTier,
  repeatTier,
  streakTier,
  streakTierLabel,
  type StreakTier,
} from "../lib/streak-tiers";
import { useDailyGoalStore } from "../hooks/useDailyGoal";
import { DAILY_GOALS, wordsToday, type DailyGoalStore } from "../lib/daily-goal";
import { StreakMedal } from "./StreakMedal";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bookmark, ChevronDown, Heart, Medal, Undo2, X } from "lucide-react";
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useSavedWords } from "../hooks/useSavedWords";
import { resolveClue } from "../lib/clues";
import { posLabel, topicLabel } from "../lib/i18n";
import { isJapaneseLevel } from "../lib/schema";
import { t } from "../lib/ui-copy";
import { useLocale } from "../lib/useLocale";
import { localeCopy, type Locale } from "../lib/locale";
import { groupSavedWords, type WordGroup } from "../lib/saved-groups";
import type { SavedWord } from "../lib/saved-words";
import { FilledUsage, MarkedText } from "./MarkedText";
import { WordPronunciation } from "./WordPronunciation";
import "../vocabulary.css";

/** Which reaction defines the list on screen. */
/** The two word lists; the milestones tab sits beside them but holds no words. */
type WordTabKind = "bookmark" | "heart";
type TabKind = WordTabKind | "medal";

const WORD_TABS: { kind: WordTabKind }[] = [{ kind: "bookmark" }, { kind: "heart" }];
const TABS: { kind: TabKind }[] = [...WORD_TABS, { kind: "medal" }];
const TAB_ICON: Record<TabKind, typeof Bookmark> = {
  bookmark: Bookmark,
  heart: Heart,
  medal: Medal,
};

const JP_LEVEL_KEYS = {
  JPRIM: "japanese.JPRIM",
  JSEC: "japanese.JSEC",
  JHIGH: "japanese.JHIGH",
  JCOLL: "japanese.JCOLL",
} as const;

/**
 * The word carried by each chip in the empty vault, on the Chinese host only.
 * Keep them to two characters: the chip is a 34×22 block, and a longer word
 * shrinks the glyph past the point where it reads as a word at all.
 */
const CHIP_WORDS: Record<WordTabKind, string> = {
  bookmark: "收藏",
  heart: "喜爱",
};

/**
 * A tooltip bubble in the empty vault. The sentence is split per WORD so each one can be
 * animated in on its own beat — a block of text appearing at once reads as a label, while
 * words arriving one after another reads as someone talking, which is the point here.
 *
 * The bubble's body and tail live in one `.vocab-vault-tip-shape` layer behind the text:
 * the outline is drawn by a filter over that layer, so box and tail are outlined as a
 * SINGLE silhouette with no seam where they meet. Putting the text in the same layer would
 * have the filter trace every glyph too.
 * @param kind - Which key this bubble points at
 * @param ui - Active locale for the tooltip's chatty line
 */
function VaultTip({ kind, ui }: { kind: WordTabKind; ui: Locale }): React.ReactElement {
  return (
    <span className="vocab-vault-tip" data-tip={kind}>
      <span className="vocab-vault-tip-shape" />
      {t(ui, `saved.placeholder.${kind}`)
        .split(" ")
        .map((word, index) => (
          <span
            key={`${word}-${index}`}
            className="vocab-vault-word"
            style={{ "--i": index } as CSSProperties}
          >
            {word}
          </span>
        ))}
    </span>
  );
}

/** How far a row has to travel sideways before it counts as a swipe. */
const SWIPE_PX = 56;
/** How long a held touch counts as a long-press before it offers to remove the row. */
const LONG_PRESS_MS = 500;
/** How long the undo offer stays up after a removal. */
const UNDO_MS = 6000;

/**
 * One kept word. Swipe it sideways or press Delete to take it off the list. Holding it
 * only offers removal: a reader pressing around to see what the row does must not lose
 * the word, so the hold opens a confirm bar and the removal waits for its button.
 */
function SavedRow({
  entry,
  flag,
  compact,
  onRemove,
  ui,
}: {
  entry: SavedWord;
  flag: string;
  /** Compact list: the word alone until the reader asks for the rest. */
  compact: boolean;
  onRemove: () => void;
  ui: Locale;
}) {
  const [shift, setShift] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);
  const settled = useRef(true);

  // The offer stands until it is answered or the reader touches anything outside the row.
  useEffect(() => {
    if (!confirming) return;
    confirmRef.current?.focus();
    function onOutside(event: globalThis.PointerEvent) {
      if (!rowRef.current?.contains(event.target as Node)) setConfirming(false);
    }
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [confirming]);

  function cancelConfirm() {
    setConfirming(false);
    rowRef.current?.focus();
  }

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function settle() {
    clearTimer();
    settled.current = true;
    origin.current = null;
    setPressing(false);
    setShift(0);
  }

  function fire() {
    settle();
    onRemove();
  }

  function offer() {
    settle();
    setConfirming(true);
  }

  function reset() {
    clearTimer();
    if (settled.current) return;
    settled.current = true;
    origin.current = null;
    setPressing(false);
    setShift(0);
  }

  const shifted = Math.abs(shift) > 8;

  function onPointerDown(event: PointerEvent<HTMLLIElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // While the offer is up the row is still; its buttons take the taps.
    if (confirming) return;
    settled.current = false;
    origin.current = { x: event.clientX, y: event.clientY };
    clearTimer();
    // A held mouse button is a click that went slightly long, so the countdown gesture
    // is reserved for touch and pen; a mouse removes a word by swiping it. The countdown
    // visual is gated on the same test, or a plain click would flash a wipe that never
    // commits.
    if (event.pointerType !== "mouse") {
      setPressing(true);
      timer.current = window.setTimeout(offer, LONG_PRESS_MS);
    }
    // Track the finger even when it slides off the row's own box. Kept last: a browser
    // that rejects the pointer id then cannot cost the rest of the gesture.
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // No capture to lose — the row still follows the pointer events it receives.
    }
  }

  function onPointerMove(event: PointerEvent<HTMLLIElement>) {
    const start = origin.current;
    if (!start || settled.current) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // A taller-than-wide drag is the reader scrolling the page, not swiping the row,
    // so the gesture is abandoned rather than following the finger.
    if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
      reset();
      return;
    }
    if (Math.abs(dx) > 8) clearTimer(); // horizontal intent cancels the long-press
    setShift(Math.max(-96, Math.min(96, dx)));
    if (Math.abs(dx) >= SWIPE_PX) fire();
  }

  function onPointerUp() {
    // A tap is what is LEFT once the other gestures are ruled out: the long-press
    // already opened its offer (settled) or the finger travelled far enough to be
    // a swipe. Only then does it mean "show me the meaning".
    const tapped = compact && !settled.current && Math.abs(shift) <= 8;
    reset();
    if (tapped) setRevealed((on) => !on);
  }

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (confirming) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelConfirm();
      }
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onRemove();
      return;
    }
    // The row is the control in compact mode, so it answers to the keys a
    // disclosure normally would.
    if (compact && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      setRevealed((on) => !on);
    }
  }

  /** Everything below the word, withheld until asked for in compact mode. */
  const showDetail = !compact || revealed;

  return (
    <li
      ref={rowRef}
      className="vocab-saved-item"
      data-pressing={pressing || undefined}
      data-confirming={confirming || undefined}
      data-shifted={shifted || undefined}
      data-reveal={shifted ? (shift < 0 ? "right" : "left") : undefined}
      style={{ "--row-shift": `${shift}px` } as CSSProperties}
      data-compact={compact || undefined}
      tabIndex={0}
      aria-expanded={compact ? revealed : undefined}
      aria-label={
        compact
          ? t(ui, "saved.row.ariaCompact", { word: entry.word.word, action: flag.toLowerCase() })
          : t(ui, "saved.row.aria", { word: entry.word.word, action: flag.toLowerCase() })
      }
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <span className="vocab-saved-row-flag" aria-hidden="true">
        {flag}
      </span>
      {confirming && (
        <div
          className="vocab-saved-confirm"
          role="group"
          aria-label={t(ui, "saved.row.confirm", { action: flag, word: entry.word.word })}
        >
          <button
            ref={confirmRef}
            type="button"
            className="vocab-saved-confirm-remove"
            onClick={() => {
              setConfirming(false);
              onRemove();
            }}
          >
            {flag}
          </button>
          <button type="button" className="vocab-saved-confirm-keep" onClick={cancelConfirm}>
            {t(ui, "saved.confirm.keep")}
          </button>
        </div>
      )}
      <div className="vocab-saved-row-body">
        <div className="vocab-saved-word-row">
          <h3 className="vocab-saved-word" lang="en">
            {entry.word.word}
          </h3>
          {showDetail && (
            <div className="vocab-saved-badges">
              {entry.word.level && (
                <span className="vocab-saved-badge">
                  {isJapaneseLevel(entry.word.level)
                    ? t(ui, JP_LEVEL_KEYS[entry.word.level])
                    : entry.word.level}
                </span>
              )}
              {entry.word.pos && (
                <span className="vocab-saved-badge" data-plain>
                  {posLabel(entry.word.pos, ui)}
                </span>
              )}
              {entry.word.topic && (
                <span className="vocab-saved-badge" data-plain>
                  {topicLabel(entry.word.topic, ui)}
                </span>
              )}
            </div>
          )}
          {compact && <ChevronDown className="vocab-saved-peek" size={16} aria-hidden="true" />}
        </div>

        {showDetail && (
          <>
            <WordPronunciation word={entry.word} className="vocab-saved-pronunciation" />
            <p className="vocab-saved-def" lang={ui}>
              <MarkedText
                text={
                  ui === "ja" && entry.word.meaningJP
                    ? entry.word.meaningJP
                    : resolveClue(entry.word, "def", ui)
                }
              />
            </p>
            {entry.word.usage[0] && (
              <p className="vocab-saved-usage" lang="en">
                <FilledUsage text={entry.word.usage[0].en} word={entry.word.word} />
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/** Group heading plus its folders; a folder only appears when the group outgrows one. */
function SavedFolders({
  groups,
  flag,
  compact,
  onRemove,
  ui,
}: {
  groups: WordGroup[];
  flag: string;
  compact: boolean;
  onRemove: (entry: SavedWord) => void;
  ui: Locale;
}) {
  return (
    <div className="vocab-saved-groups">
      {groups.map((group) => (
        <section className="vocab-saved-group" key={group.id}>
          <h2 className="vocab-saved-group-title">
            <span>{group.label}</span>
            {group.hint && <span className="vocab-saved-group-hint">{group.hint}</span>}
            <span className="vocab-saved-group-count">
              <b>{group.count}</b> {t(ui, "onboard.wordsUnit")}
            </span>
          </h2>
          {group.folders.length === 1 ? (
            <ul className="vocab-saved-list">
              {group.folders[0].words.map((entry) => (
                <SavedRow
                  key={entry.word.id}
                  entry={entry}
                  flag={flag}
                  compact={compact}
                  onRemove={() => onRemove(entry)}
                  ui={ui}
                />
              ))}
            </ul>
          ) : (
            group.folders.map((folder, index) => (
              <details className="vocab-saved-folder" key={folder.id} open={index === 0}>
                <summary className="vocab-saved-folder-summary">
                  <span>{folder.label}</span>
                  <span className="vocab-saved-group-count">
                    <b>{folder.words.length}</b> {t(ui, "onboard.wordsUnit")}
                  </span>
                </summary>
                <ul className="vocab-saved-list">
                  {folder.words.map((entry) => (
                    <SavedRow
                      key={entry.word.id}
                      entry={entry}
                      flag={flag}
                      compact={compact}
                      onRemove={() => onRemove(entry)}
                      ui={ui}
                    />
                  ))}
                </ul>
              </details>
            ))
          )}
        </section>
      ))}
    </div>
  );
}

const MEDAL_COPY: Partial<
  Record<
    Locale,
    {
      dayUnit: string;
      wordUnit: string;
      streakTitle: (days: number) => string;
      dailyTitle: (goal: number) => string;
      completeSet: string;
      wordsCount: (words: number) => string;
      earnedStatus: string;
      gotIt: string;
      tileAria: (
        caption: string,
        note: string | undefined,
        earned: boolean,
        percent: number,
      ) => string;
      emptyHint: string;
      dailyHeading: string;
      wordsPerDay: (goal: number) => string;
      timesCount: (times: number) => string;
      wordsHeading: string;
      streakHeading: string;
      repeatDailyTitle: (times: number, base: number) => string;
      repeatStreakTitle: (times: number, base: number) => string;
      levelRow: string;
      trackRow: string;
    }
  >
> = {
  vi: {
    dayUnit: "ngày",
    wordUnit: "từ",
    streakTitle: (days) => `Chuỗi ${days} ngày`,
    dailyTitle: (goal) => `${goal} từ mỗi ngày`,
    completeSet: "Trọn bộ",
    wordsCount: (words) => `${words} từ`,
    earnedStatus: "Đã đạt",
    gotIt: "Đã hiểu",
    tileAria: (caption, note, earned, percent) =>
      `${caption}${earned ? (note ? `, ${note}` : "") : `, chưa đạt, ${percent}%`}. Xem điều kiện`,
    emptyHint: "Chạm vào một huy hiệu bên dưới để xem cách mở khóa.",
    dailyHeading: "Số từ trong một ngày",
    wordsPerDay: (goal) => `${goal} từ/ngày`,
    timesCount: (times) => `${times} lần`,
    wordsHeading: "Số từ đã học",
    streakHeading: "Chuỗi ngày liên tiếp",
    repeatDailyTitle: (times, base) => `${times} lần ${base} từ mỗi ngày`,
    repeatStreakTitle: (times, base) => `${times} lần chuỗi ${base} ngày`,
    levelRow: "Cấp độ",
    trackRow: "Gói từ",
  },
  ja: {
    dayUnit: "日",
    wordUnit: "語",
    streakTitle: (days) => `${days}日連続`,
    dailyTitle: (goal) => `1日 ${goal} 語`,
    completeSet: "コンプリート",
    wordsCount: (words) => `${words} 語`,
    earnedStatus: "獲得済み",
    gotIt: "閉じる",
    tileAria: (caption, note, earned, percent) =>
      `${caption}${earned ? (note ? `、${note}` : "") : `、未獲得、${percent}%`}。条件を見る`,
    emptyHint: "下のバッジをタップして獲得条件を確認できます。",
    dailyHeading: "1日の単語数",
    wordsPerDay: (goal) => `${goal} 語/日`,
    timesCount: (times) => `${times} 回`,
    wordsHeading: "学習した単語",
    streakHeading: "連続日数",
    repeatDailyTitle: (times, base) => `1日 ${base} 語を ${times} 回`,
    repeatStreakTitle: (times, base) => `${base}日連続を ${times} 回`,
    levelRow: "レベル",
    trackRow: "難易度",
  },
  th: {
    dayUnit: "วัน",
    wordUnit: "คำ",
    streakTitle: (days) => `ต่อเนื่อง ${days} วัน`,
    dailyTitle: (goal) => `วันละ ${goal} คำ`,
    completeSet: "ครบชุด",
    wordsCount: (words) => `${words} คำ`,
    earnedStatus: "ได้รับแล้ว",
    gotIt: "เข้าใจแล้ว",
    tileAria: (caption, note, earned, percent) =>
      `${caption}${earned ? (note ? `, ${note}` : "") : `, ยังไม่บรรลุ, ${percent}%`} ดูเงื่อนไข`,
    emptyHint: "แตะเหรียญด้านล่างเพื่อดูวิธีปลดล็อก",
    dailyHeading: "จำนวนคำต่อวัน",
    wordsPerDay: (goal) => `${goal} คำ/วัน`,
    timesCount: (times) => `${times} ครั้ง`,
    wordsHeading: "คำที่เรียนแล้ว",
    streakHeading: "สถิติวันต่อเนื่อง",
    repeatDailyTitle: (times, base) => `วันละ ${base} คำ ${times} ครั้ง`,
    repeatStreakTitle: (times, base) => `ต่อเนื่อง ${base} วัน ${times} ครั้ง`,
    levelRow: "ระดับ",
    trackRow: "ความยาก",
  },
};

/**
 * How a badge looks, whatever its kind: the number on its face, its metal, the word under
 * the number, and its name. A daily goal always shows the words it asks for on its face;
 * once met, how many days it has been met rides on the coin's corner. A repeat badge shows
 * the goal it repeats, with the times it asks for on the corner.
 */
function medalLook(
  goal: BadgeGoal,
  locale: TargetLocale,
  ui: Locale,
): { value: number; tier: StreakTier; unit: string; title: string; count?: number } {
  const copy = localeCopy(MEDAL_COPY, ui);
  if (goal.kind === "streak") {
    return {
      value: goal.days,
      tier: streakTier(goal.days),
      unit: copy.dayUnit,
      title: copy.streakTitle(goal.days),
    };
  }
  if (goal.kind === "repeat") {
    const daily = goal.of === "daily";
    return {
      value: goal.base,
      tier: repeatTier(goal.of, goal.base, goal.times),
      unit: daily ? copy.wordUnit : copy.dayUnit,
      title: daily
        ? copy.repeatDailyTitle(goal.times, goal.base)
        : copy.repeatStreakTitle(goal.times, goal.base),
      count: goal.times,
    };
  }
  if (goal.kind === "daily") {
    const title = copy.dailyTitle(goal.goal);
    const tier = dailyTier(goal.goal);
    return {
      value: goal.goal,
      tier,
      unit: copy.wordUnit,
      title,
      count: goal.times > 0 ? goal.times : undefined,
    };
  }
  return {
    value: goal.words,
    tier: wordTier({ words: goal.words, complete: goal.complete }),
    unit: copy.wordUnit,
    title: `${goal.complete ? copy.completeSet : copy.wordsCount(goal.words)} · ${scopeLabel(goal.scope, locale, ui)}`,
  };
}

/**
 * The criteria behind one badge, earned or not: what it asks, where the reader stands on
 * it, and its metal. A native <dialog> opened modal, so it sits in the top layer above
 * the saved drawer, and Escape and focus come from the browser; a tap on the backdrop
 * closes it too.
 */
function BadgeDialog({
  goal,
  earned,
  locale,
  ui,
  onClose,
}: {
  goal: BadgeGoal;
  earned: boolean;
  locale: TargetLocale;
  ui: Locale;
  onClose: () => void;
}) {
  const copy = localeCopy(MEDAL_COPY, ui);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
  }, []);
  const { value, tier, unit, title, count } = medalLook(goal, locale, ui);
  return (
    <dialog
      ref={dialog}
      className="vocab-badge-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // The dialog box fills its own padding, so a click on the element itself is a
        // click on the backdrop around it.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="vocab-badge-dialog-body">
        <StreakMedal
          days={value}
          tier={tier}
          unit={unit}
          count={count}
          className={earned ? undefined : "vocab-medal-locked"}
        />
        <span className="vocab-badge-dialog-tier">{streakTierLabel(tier, ui)}</span>
        <h2 id={titleId}>{title}</h2>
        <p>{badgeGoalCriteria(goal, locale, ui)}</p>
        <p className="vocab-badge-dialog-status" data-earned={earned || undefined}>
          {/* A daily goal is earned again and again, so where it stands stays news. */}
          {earned && goal.kind !== "daily" ? copy.earnedStatus : badgeGoalProgress(goal, ui)}
        </p>
        <form method="dialog">
          <button type="submit" className="vocab-badge-dialog-close">
            {copy.gotIt}
          </button>
        </form>
      </div>
    </dialog>
  );
}

/** One medal on the shelf, as a button that opens its criteria. */
function MedalTile({
  goal,
  earned,
  caption,
  note,
  locale,
  ui,
  onOpen,
}: {
  goal: BadgeGoal;
  earned: boolean;
  caption: string;
  /** Under an earned medal, when there is something to add ("4 lần"). */
  note?: string;
  locale: TargetLocale;
  ui: Locale;
  onOpen: (goal: BadgeGoal, earned: boolean) => void;
}) {
  const copy = localeCopy(MEDAL_COPY, ui);
  const look = medalLook(goal, locale, ui);
  const percent = Math.round(badgeGoalRatio(goal) * 100);
  return (
    <li>
      <button
        type="button"
        className="vocab-medal-tile"
        data-locked={earned ? undefined : true}
        onClick={() => onOpen(goal, earned)}
        aria-label={copy.tileAria(caption, note, earned, percent)}
      >
        <StreakMedal days={look.value} tier={look.tier} unit={look.unit} count={look.count} />
        <span className="vocab-medal-tile-days">{caption}</span>
        {earned ? (
          note && (
            <span className="vocab-medal-tile-tier" data-scope>
              {note}
            </span>
          )
        ) : (
          <span className="vocab-medal-tile-progress" aria-hidden>
            <span style={{ width: `${percent}%` }} />
          </span>
        )}
      </button>
    </li>
  );
}

/** One rung of a ladder as a tile: its face, its caption, and its count or bar below. */
function RungTile({
  rung,
  locale,
  ui,
  onOpen,
}: {
  rung: BadgeRung;
  locale: TargetLocale;
  ui: Locale;
  onOpen: (goal: BadgeGoal, earned: boolean) => void;
}) {
  const copy = localeCopy(MEDAL_COPY, ui);
  const { goal, earned } = rung;
  const shared = { goal, earned, locale, ui, onOpen };
  if (goal.kind === "daily") {
    return (
      <MedalTile
        {...shared}
        caption={copy.wordsPerDay(goal.goal)}
        note={copy.timesCount(goal.times)}
      />
    );
  }
  if (goal.kind === "repeat") {
    const unit = goal.of === "daily" ? copy.wordUnit : copy.dayUnit;
    return <MedalTile {...shared} caption={`${goal.base} ${unit} ×${goal.times}`} />;
  }
  if (goal.kind === "streak") {
    return <MedalTile {...shared} caption={t(ui, "saved.medal.days", { days: goal.days })} />;
  }
  return (
    <MedalTile
      {...shared}
      caption={goal.complete ? copy.completeSet : copy.wordsCount(goal.words)}
    />
  );
}

function rungKey({ goal }: BadgeRung): string {
  if (goal.kind === "daily") return `daily:${goal.goal}`;
  if (goal.kind === "streak") return `streak:${goal.days}`;
  if (goal.kind === "repeat") return `repeat:${goal.of}:${goal.base}:${goal.times}`;
  return `${goal.scope}:${goal.words}`;
}

/**
 * The milestones tab, in three sections: words in one day, days in a row, and words
 * learned — one row for the single level and one for the pack (difficulty track) taken
 * furthest. Each row shows what this device has earned, lowest first, then the very next
 * badge in grey with a bar for how close it is. Every medal opens its criteria on tap.
 */
function MedalShelf({
  badges,
  wordBadges,
  daily,
  locale,
  ui,
}: {
  badges: number[];
  wordBadges: EarnedWordBadge[];
  daily: DailyGoalStore;
  locale: TargetLocale;
  ui: Locale;
}) {
  const copy = localeCopy(MEDAL_COPY, ui);
  const [open, setOpen] = useState<{ goal: BadgeGoal; earned: boolean } | null>(null);
  const { scopes, levelCounts } = useMemo(() => progressScopes(locale), [locale]);
  // Read fresh on every change to the earned lists: those are what move the next goals.
  const progress = useMemo(() => {
    const store = readProgress();
    const streak = readStreak();
    return {
      seen: store.seen,
      streakNow: currentStreak(streak),
      streakDays: streak.days,
      streakRepeats: streak.repeats,
      today: wordsToday(daily, Date.now()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badges, wordBadges, daily]);
  const ladders = useMemo(
    () =>
      badgeLadders({
        daily: { times: daily.times, today: progress.today },
        streakEarned: badges,
        streakNow: progress.streakNow,
        streakDays: progress.streakDays,
        streakRepeats: progress.streakRepeats,
        wordEarned: wordBadges.map((badge) => badge.key),
        levelScopes: scopes.filter((scope) => scopeKind(scope.id, locale) === "level"),
        trackScopes: scopes.filter((scope) => scopeKind(scope.id, locale) === "track"),
        seen: progress.seen,
        levelCounts,
      }),
    [badges, wordBadges, progress, scopes, levelCounts, daily.times, locale],
  );
  const wordRows = [
    { kind: copy.levelRow, ladder: ladders.level },
    { kind: copy.trackRow, ladder: ladders.track },
  ].filter((row): row is { kind: string; ladder: BadgeLadder } => row.ladder !== null);
  const nothingYet =
    !badges.length && !wordBadges.length && DAILY_GOALS.every((goal) => daily.times[goal] === 0);
  const open_ = (goal: BadgeGoal, earned: boolean) => setOpen({ goal, earned });
  const shelf = (rungs: BadgeRung[]) => (
    <ul className="vocab-medal-shelf">
      {rungs.map((rung) => (
        <RungTile key={rungKey(rung)} rung={rung} locale={locale} ui={ui} onOpen={open_} />
      ))}
    </ul>
  );
  return (
    <>
      {nothingYet && (
        <div className="vocab-medal-empty">
          <h2>{t(ui, "saved.empty.medal.title")}</h2>
          <p>{copy.emptyHint}</p>
        </div>
      )}
      {ladders.daily.length > 0 && (
        <section className="vocab-medal-group" aria-label={copy.dailyHeading}>
          <h3 className="vocab-medal-group-title">{copy.dailyHeading}</h3>
          {shelf(ladders.daily)}
        </section>
      )}
      {ladders.streak.length > 0 && (
        <section className="vocab-medal-group" aria-label={copy.streakHeading}>
          <h3 className="vocab-medal-group-title">{copy.streakHeading}</h3>
          {shelf(ladders.streak)}
        </section>
      )}
      {wordRows.length > 0 && (
        <section className="vocab-medal-group" aria-label={copy.wordsHeading}>
          <h3 className="vocab-medal-group-title">{copy.wordsHeading}</h3>
          {wordRows.map(({ kind, ladder }) => (
            <div key={kind} className="vocab-medal-ladder">
              <h4 className="vocab-medal-ladder-title">
                <small>{kind}</small>
                {/* The row already says "level", so a level shows as its bare name. */}
                {scopeKind(ladder.scope, locale) === "level"
                  ? ladder.scope
                  : scopeLabel(ladder.scope, locale, ui)}
              </h4>
              {shelf(ladder.rungs)}
            </div>
          ))}
        </section>
      )}
      {open && (
        <BadgeDialog
          goal={open.goal}
          earned={open.earned}
          locale={locale}
          ui={ui}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/**
 * Show this device's saved words as folders, with a swipe/hold gesture to un-save.
 * @param onClose Present when the list is embedded in the feed's saved drawer
 *   rather than standing as its own route: the shell drops to a plain div (a
 *   second <main> inside the feed's would be invalid) and the leading control
 *   becomes a close button instead of a link back to the feed.
 */
export function BookmarksPage({ onClose }: { onClose?: () => void } = {}) {
  const ui = useLocale();
  const { saved, favorites, remove, restore } = useSavedWords();
  const [tab, setTab] = useState<TabKind>("bookmark");
  // Compact is the resting state: the list is a self-test first — word alone, meaning on
  // tap — and the per-tab toggle below opens it out again.
  const [compact, setCompact] = useState(true);
  const [undo, setUndo] = useState<{
    word: string;
    id: string;
    kind: WordTabKind;
    /** The day the row was filed under, so undo can put it back in the same group. */
    at?: number;
  } | null>(null);
  const groupId = useId();
  // The visited address decides the deck: only the Chinese host labels the vault's
  // falling chips with a Han word; every other host keeps them bare blocks.
  const locale = useMemo<TargetLocale>(
    () => (typeof window === "undefined" ? DEFAULT_TARGET : resolveTarget(window.location.host)),
    [],
  );
  const isZhHost = locale === "zh";

  const badges = useStreakBadges();
  const wordBadges = useWordBadges();
  const daily = useDailyGoalStore();
  // The repeats are read fresh whenever a milestone list or the daily store changes.
  const repeatsEarned = useMemo(
    () => earnedRepeatCount(daily.times[DAILY_REPEATS.goal], readStreak().repeats),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daily.times, badges],
  );
  const counts: Record<TabKind, number> = {
    bookmark: saved.length,
    heart: favorites.length,
    medal:
      badges.length +
      wordBadges.length +
      DAILY_GOALS.filter((goal) => daily.times[goal] > 0).length +
      repeatsEarned,
  };

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

  /** A tablist is expected to move between tabs with the arrow keys. */
  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    // The density button sits in this row too: arrows pressed on it belong to it, not to
    // the tablist, or the list would switch lists under the reader's finger.
    if (!(event.target as HTMLElement).closest('[role="tab"]')) return;
    event.preventDefault();
    const at = TABS.findIndex((item) => item.kind === tab);
    const step = event.key === "ArrowRight" ? 1 : -1;
    setTab(TABS[(at + step + TABS.length) % TABS.length].kind);
  }

  function handleRemove(entry: SavedWord, kind: WordTabKind) {
    setUndo({ word: entry.word.word, id: entry.word.id, kind, at: entry.savedAt });
    remove(entry.word.id, kind);
  }

  const embedded = Boolean(onClose);
  const Shell = embedded ? "div" : "main";

  return (
    <Shell
      className={`vocabulary-shell vocab-saved-shell${embedded ? " vocab-saved-embedded" : ""}`}
    >
      <header className="vocab-saved-header">
        {onClose ? (
          <button
            type="button"
            className="vocab-icon-button"
            onClick={onClose}
            aria-label={t(ui, "saved.close")}
          >
            <X size={19} />
          </button>
        ) : (
          <Link className="vocab-icon-button" to="/feed" aria-label={t(ui, "saved.back")}>
            <ArrowLeft size={19} />
          </Link>
        )}
        <div>
          <h1 className="vocab-saved-title">{t(ui, "saved.title")}</h1>
          <p className="vocab-saved-subtitle">{t(ui, "saved.subtitle")}</p>
        </div>
      </header>

      <div
        className="vocab-saved-tabs"
        role="tablist"
        aria-label={t(ui, "saved.list.aria")}
        onKeyDown={onTabKeyDown}
      >
        {TABS.map((item, index) => {
          // The density control belongs to the list that is open, so it rides on the active
          // tab itself rather than standing in a switch row of its own. It is withheld until
          // there is something to expand.
          const fused = tab === item.kind && item.kind !== "medal" && counts[item.kind] > 0;
          const expandLabel = compact ? t(ui, "saved.expand") : t(ui, "saved.collapse");
          const Icon = TAB_ICON[item.kind];
          const tabLabel = t(ui, `saved.tab.${item.kind}`);
          return (
            // One slot per tab. The slot, not the tab, carries the active bar, so the
            // indicator spans the whole segment — fused control included. The open slot
            // takes 2.5 shares of the strip and the closed ones shrink to their icon.
            <Fragment key={item.kind}>
              {/* The gap between two slots is a spacer of its own, so its 1px bottom edge
                  continues the container's top line wherever the gap happens to fall. */}
              {index > 0 && <span className="vocab-saved-tab-gap" aria-hidden="true" />}
              <div
                className="vocab-saved-tab-slot"
                role="presentation"
                data-on={tab === item.kind || undefined}
              >
                <button
                  type="button"
                  role="tab"
                  id={`${groupId}-tab-${item.kind}`}
                  aria-selected={tab === item.kind}
                  aria-controls={`${groupId}-panel-${item.kind}`}
                  tabIndex={tab === item.kind ? 0 : -1}
                  className="vocab-saved-tab"
                  data-on={tab === item.kind || undefined}
                  onClick={() => setTab(item.kind)}
                  title={tab === item.kind ? undefined : tabLabel}
                >
                  <Icon size={15} />
                  {/* Closed tabs show only the icon; the label stays in the accessibility tree. */}
                  <span className="vocab-saved-tab-label">{tabLabel}</span>
                  <span className="vocab-saved-tab-count">{counts[item.kind]}</span>
                </button>
                {fused && (
                  <button
                    type="button"
                    className="vocab-saved-density"
                    aria-pressed={!compact}
                    aria-label={expandLabel}
                    title={expandLabel}
                    onClick={() => setCompact((value) => !value)}
                  >
                    {/* Peek-a-boo reads as tappable where a chevron didn't: the meanings are
                        tucked behind two palms (faint = there is something to uncover), and a
                        tap parts them into a wide-eyed stare (solid = the list is open). Color
                        emoji, never a mono glyph. */}
                    <span className="vocab-saved-density-emoji" aria-hidden="true">
                      {compact ? "🫣" : "😳"}
                    </span>
                  </button>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>

      <div
        id={`${groupId}-panel-medal`}
        role="tabpanel"
        aria-labelledby={`${groupId}-tab-medal`}
        className="vocab-saved-panelbox"
        hidden={tab !== "medal" || undefined}
      >
        <MedalShelf badges={badges} wordBadges={wordBadges} daily={daily} locale={locale} ui={ui} />
      </div>

      {WORD_TABS.map((item) => {
        // Filed by day, always. Grouping by level was a second switch for something the
        // reader never changed, so the list keeps the one order that matches how it was
        // collected. Each tab owns its container: list and empty scene alike live inside
        // the panel that tab controls, so switching tabs swaps containers, not contents.
        const kindRows = item.kind === "bookmark" ? saved : favorites;
        const kindGroups = groupSavedWords(kindRows, "day", ui);
        return (
          <div
            key={item.kind}
            id={`${groupId}-panel-${item.kind}`}
            role="tabpanel"
            aria-labelledby={`${groupId}-tab-${item.kind}`}
            className="vocab-saved-panelbox"
            hidden={tab !== item.kind || undefined}
          >
            {kindRows.length ? (
              <div className="vocab-saved-body">
                <p className="vocab-saved-hint">
                  {compact ? t(ui, "saved.tapForMeaning") : ""}
                  {t(ui, "saved.hint", {
                    action: t(ui, `saved.remove.${item.kind}`).toLowerCase(),
                  })}
                </p>
                <SavedFolders
                  groups={kindGroups}
                  flag={t(ui, `saved.remove.${item.kind}`)}
                  compact={compact}
                  onRemove={(entry) => handleRemove(entry, item.kind)}
                  ui={ui}
                />
              </div>
            ) : (
              <div className="vocab-saved-empty">
                {/* The empty list is the one screen that has to TEACH the gesture, so instead of a
                    lone grey glyph it shows the vault doing its job: the two buttons the reader
                    will actually tap, a word-chip dropping from the one this tab belongs to, and
                    the jar catching it. Entirely decorative — the heading and body below say the
                    same thing in words, so a screen reader loses nothing by skipping it. */}
                <div className="vocab-vault" aria-hidden="true">
                  {/* One tooltip per key. Each is centred on its own key — the bookmark held above,
                      the heart directly underneath — so each tail points straight at its icon's
                      midpoint and the pair reads symmetrically about the centre line. */}
                  <VaultTip kind="heart" ui={ui} />
                  <VaultTip kind="bookmark" ui={ui} />
                  {/* Heart first, then bookmark — the same order the two buttons sit in under every
                      word in the feed, so the row learned here matches the row they will tap. */}
                  <div className="vocab-vault-keys">
                    <span className="vocab-vault-key" data-key="heart" data-active>
                      <Heart size={17} strokeWidth={2.2} />
                    </span>
                    <span className="vocab-vault-key" data-key="bookmark" data-active>
                      <Bookmark size={17} strokeWidth={2.2} />
                    </span>
                  </div>
                  {/* The mouth, BEHIND the chips, so a block stays bright while it sinks into the
                      opening and is masked by the bowl's near (lower) rim, not the top arc. */}
                  <span className="vocab-vault-lid" />
                  {/* Two blocks drop into the jar — one per reaction — so the scene teaches both
                      gestures at once instead of one per tab. The heart's is pink. On the Chinese
                      host each block carries a two-character word of its reaction's own theme. */}
                  <span className="vocab-vault-chip" data-chip="bookmark">
                    {isZhHost && (
                      <span className="vocab-vault-chip-word" lang="zh-Hans">
                        {CHIP_WORDS.bookmark}
                      </span>
                    )}
                  </span>
                  <span className="vocab-vault-chip" data-chip="heart">
                    {isZhHost && (
                      <span className="vocab-vault-chip-word" lang="zh-Hans">
                        {CHIP_WORDS.heart}
                      </span>
                    )}
                  </span>
                  <div className="vocab-vault-jar">
                    {/* The bowl's front wall is its own layer so it can be masked: its top edge has
                        to BE the opening's lower arc, and a mask on the jar itself would also eat
                        the sparks and the halo that sit outside the bowl. */}
                    <span className="vocab-vault-body" />
                    <span className="vocab-vault-shine" />
                    <span className="vocab-vault-spark" data-s="1" />
                    <span className="vocab-vault-spark" data-s="2" />
                    <span className="vocab-vault-spark" data-s="3" />
                  </div>
                </div>
                <h2>{t(ui, `saved.empty.${item.kind}.title`)}</h2>
                {/* Two lengths, one shown at a time: a landscape phone drops the bowl and
                    most of the scene, so the instruction has to carry itself in one line. */}
                <p className="vocab-saved-empty-long">{t(ui, `saved.empty.${item.kind}.body`)}</p>
                <p className="vocab-saved-empty-short">{t(ui, `saved.empty.${item.kind}.short`)}</p>
                {/* In the drawer the feed is already behind the panel, so the way
                    back is to close it — a link to /feed would be a dead button. */}
                {onClose ? (
                  <button type="button" className="vocab-light-button" onClick={onClose}>
                    {t(ui, "saved.back")}
                  </button>
                ) : (
                  <Link className="vocab-light-button" to="/feed">
                    {t(ui, "saved.back")}
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}

      {undo && (
        <div className="vocab-saved-undo" role="status">
          <span>
            {t(ui, `saved.remove.${undo.kind}.undo`)} <strong lang="en">{undo.word}</strong>
          </span>
          <button
            type="button"
            className="vocab-saved-undo-button"
            onClick={() => {
              restore(undo.id, undo.kind, undo.at);
              setUndo(null);
            }}
          >
            <Undo2 size={15} />
            {t(ui, "saved.undo")}
          </button>
        </div>
      )}
    </Shell>
  );
}
