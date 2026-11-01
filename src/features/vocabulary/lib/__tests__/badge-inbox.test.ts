import { beforeEach, describe, expect, it } from "vitest";
import {
  BADGE_INBOX_KEY,
  addBadge,
  dropBadge,
  enqueueBadge,
  nextBadge,
  parseBadgeInbox,
  readBadgeInbox,
  removeBadge,
  type InboxBadge,
} from "../badge-inbox";

const streak: InboxBadge = { kind: "streak", days: 3 };
const daily: InboxBadge = { kind: "daily", goal: 10, times: 1 };
const word: InboxBadge = {
  kind: "word",
  milestone: { scope: "all", words: 100, complete: false },
};

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
});

describe("the inbox", () => {
  it("keeps an earned badge until it has been shown", () => {
    enqueueBadge(daily);
    // Nothing else happens: a reload reads the same store back.
    expect(readBadgeInbox()).toEqual([daily]);
    removeBadge(daily);
    expect(readBadgeInbox()).toEqual([]);
  });

  it("holds each badge once", () => {
    expect(addBadge(addBadge([], daily), daily)).toEqual([daily]);
  });

  it("treats a repeat of a daily goal as a badge of its own", () => {
    expect(addBadge([daily], { ...daily, times: 2 })).toHaveLength(2);
  });

  it("removes only the badge that was shown", () => {
    expect(dropBadge([daily, streak], daily)).toEqual([streak]);
  });
});

describe("nextBadge", () => {
  it("has nothing to show on an empty inbox", () => expect(nextBadge([])).toBeNull());

  it("shows the rarest kind first, whatever order they were earned in", () => {
    expect(nextBadge([daily, word, streak])).toEqual(streak);
    expect(nextBadge([daily, word])).toEqual(word);
  });

  it("shows the oldest of a kind first", () => {
    expect(nextBadge([daily, { kind: "daily", goal: 25, times: 1 }])).toEqual(daily);
  });
});

describe("parseBadgeInbox", () => {
  it("reads back what was stored", () => {
    enqueueBadge(word);
    expect(parseBadgeInbox(store.get(BADGE_INBOX_KEY) ?? null)).toEqual([word]);
  });

  it("survives a missing or broken store", () => {
    expect(parseBadgeInbox(null)).toEqual([]);
    expect(parseBadgeInbox("{not json")).toEqual([]);
    expect(parseBadgeInbox('{"kind":"streak"}')).toEqual([]);
  });

  it("drops entries it cannot show", () => {
    const raw = JSON.stringify([
      daily,
      { kind: "daily", goal: 7, times: 1 },
      { kind: "word", milestone: null },
      { kind: "mystery" },
      null,
    ]);
    expect(parseBadgeInbox(raw)).toEqual([daily]);
  });
});
