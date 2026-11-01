/**
 * Badges earned but not yet seen.
 *
 * Earning a badge and showing it are two moments, and only the first is guaranteed: the
 * stores record it as earned at once, so it can never be earned twice, while the
 * celebration can be lost to a reload, a closed tab or a reader looking away. So every
 * earned badge waits here, on this device, and leaves only once its celebration has played
 * out. A badge the reader missed is shown the next time the feed opens.
 *
 * Exports: BADGE_INBOX_KEY, BADGE_INBOX_EVENT, InboxBadge, badgeKey, parseBadgeInbox,
 *   addBadge, dropBadge, nextBadge, readBadgeInbox, enqueueBadge, removeBadge
 * Depends on: ./daily-goal, ./level-progress (types only)
 */
import type { DailyGoal } from "./daily-goal";
import type { WordMilestone } from "./level-progress";

export const BADGE_INBOX_KEY = "kinetic.vocab.badge-inbox";
/** Same-tab change signal; the native `storage` event skips the tab that wrote. */
export const BADGE_INBOX_EVENT = "kinetic:vocab-badge-inbox";
/** Far more than a reader can miss at once; it only stops a broken store growing. */
const INBOX_LIMIT = 24;

export type InboxBadge =
  | { kind: "streak"; days: number }
  | { kind: "word"; milestone: WordMilestone }
  | { kind: "daily"; goal: DailyGoal; times: number };

/** The rarest goes first: a streak, then a word milestone, then a daily goal. */
const PRIORITY: Record<InboxBadge["kind"], number> = { streak: 0, word: 1, daily: 2 };

/** @returns One badge's identity, so it can only wait in the inbox once. @pure true */
export function badgeKey(badge: InboxBadge): string {
  if (badge.kind === "streak") return `streak:${badge.days}`;
  if (badge.kind === "daily") return `daily:${badge.goal}:${badge.times}`;
  return `word:${badge.milestone.scope}:${badge.milestone.words}`;
}

function isBadge(value: unknown): value is InboxBadge {
  if (typeof value !== "object" || value === null) return false;
  const badge = value as Record<string, unknown>;
  if (badge.kind === "streak") return Number.isInteger(badge.days);
  if (badge.kind === "daily") {
    return [10, 25, 50].includes(badge.goal as number) && Number.isInteger(badge.times);
  }
  if (badge.kind !== "word") return false;
  const milestone = badge.milestone as Partial<WordMilestone> | null | undefined;
  return (
    typeof milestone?.scope === "string" &&
    Number.isInteger(milestone.words) &&
    typeof milestone.complete === "boolean"
  );
}

/** @param raw The stored string, or null. @returns The valid badges. @pure true */
export function parseBadgeInbox(raw: string | null): InboxBadge[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isBadge).slice(-INBOX_LIMIT) : [];
  } catch {
    return [];
  }
}

/** @returns The inbox with `badge` waiting, unless it already is. @pure true */
export function addBadge(inbox: readonly InboxBadge[], badge: InboxBadge): InboxBadge[] {
  const key = badgeKey(badge);
  if (inbox.some((entry) => badgeKey(entry) === key)) return [...inbox];
  return [...inbox, badge].slice(-INBOX_LIMIT);
}

/** @returns The inbox without `badge`. @pure true */
export function dropBadge(inbox: readonly InboxBadge[], badge: InboxBadge): InboxBadge[] {
  const key = badgeKey(badge);
  return inbox.filter((entry) => badgeKey(entry) !== key);
}

/** @returns The badge to show now: the rarest kind, oldest first. @pure true */
export function nextBadge(inbox: readonly InboxBadge[]): InboxBadge | null {
  return inbox.reduce<InboxBadge | null>(
    (best, entry) => (!best || PRIORITY[entry.kind] < PRIORITY[best.kind] ? entry : best),
    null,
  );
}

/** @returns The waiting badges; never throws. */
export function readBadgeInbox(): InboxBadge[] {
  try {
    if (typeof localStorage === "undefined") return [];
    return parseBadgeInbox(localStorage.getItem(BADGE_INBOX_KEY));
  } catch {
    return [];
  }
}

function writeBadgeInbox(inbox: readonly InboxBadge[]): void {
  try {
    localStorage.setItem(BADGE_INBOX_KEY, JSON.stringify(inbox));
  } catch {
    // Quota or privacy mode: the badge is still earned, and stays on the medal shelf.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BADGE_INBOX_EVENT));
}

/** Hold a just-earned badge until it has been shown. Never throws. */
export function enqueueBadge(badge: InboxBadge): void {
  writeBadgeInbox(addBadge(readBadgeInbox(), badge));
}

/** The badge has been shown. Never throws. */
export function removeBadge(badge: InboxBadge): void {
  writeBadgeInbox(dropBadge(readBadgeInbox(), badge));
}
