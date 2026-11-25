/**
 * Which hashtags a TikTok post carries, as an experiment: 25 tags in five groups of five,
 * one tag from each group on every post (TikTok keeps five, MAX_HASHTAGS). The rotation is
 * an orthogonal array: across one round of 25 posts every tag goes out 5 times and every
 * pair of tags from two different groups exactly once, so each tag's effect on views is read
 * on its own (its posts' mean against the round's), not tangled with the tags it sat beside.
 * It also makes every post's set unique within a round, which is how the views reader tells
 * TikTok's videos apart (their captions never name the word).
 *
 * Only TikTok runs it; the other platforms keep the calendar caption's fixed tags. Views are
 * compared at one age (VIEWS_AGE_DAYS), the first snapshot that old, since a younger video
 * has simply had less time.
 *
 * Exports: HASHTAG_GROUPS, EXPERIMENT_FIRST_POST, ROUND_POSTS, VIEWS_AGE_DAYS, experimentTags, rotationTags,
 *   withExperimentTags, ViewSnapshot, parseAgeDays, parseViews, matchSnapshot, TagEffect,
 *   hashtagReport
 * Depends on: nothing (pure)
 */

/** The pool, by group: a post takes the tag at its rotation slot from each, in this order. */
export const HASHTAG_GROUPS: ReadonlyArray<{ name: string; tags: readonly string[] }> = [
  {
    name: "learn English (broad)",
    tags: ["#hoctienganh", "#tienganh", "#tienganhgiaotiep", "#tienganhcoban", "#hoctienganhonline"],
  },
  {
    name: "vocabulary",
    tags: ["#tuvungtienganh", "#tuvung", "#tienganhmoingay", "#englishvocabulary", "#vocabulary"],
  },
  { name: "exams", tags: ["#ielts", "#toeic", "#ieltsvocabulary", "#tuvungielts", "#thptquocgia"] },
  { name: "quiz", tags: ["#doantu", "#englishquiz", "#quiz", "#guesstheword", "#thuthachtienganh"] },
  { name: "discovery", tags: ["#hoccungtiktok", "#learnontiktok", "#xuhuong", "#fyp", "#edutok"] },
];

/** The first post drafted with experiment tags (2026-11-22's 19:00 post). */
export const EXPERIMENT_FIRST_POST = 22;

/** Posts in one full round: every tag 5 times, every cross-group pair once. */
export const ROUND_POSTS = 25;

/** The age views are compared at: the first snapshot at least this old. */
export const VIEWS_AGE_DAYS = 3;

/**
 * The tags a post carries, or null for a post before the experiment.
 * Post i of a round, i = 5c + r, takes tag (r + s·c) mod 5 of group s. For two groups s < t
 * the pair (a, b) needs (t − s)·c ≡ b − a (mod 5), one c since 5 is prime, then one r.
 * @param post - the calendar post number
 * @pure true
 */
export function experimentTags(post: number): string[] | null {
  if (post < EXPERIMENT_FIRST_POST) return null;
  return rotationTags(post - EXPERIMENT_FIRST_POST);
}

/**
 * The tags at position i of the rotation (any i; it repeats every ROUND_POSTS). The retag
 * test (tiktok.ts retag) gives already-posted videos positions from the round's far end.
 * @pure true
 */
export function rotationTags(i: number): string[] {
  const at = ((i % ROUND_POSTS) + ROUND_POSTS) % ROUND_POSTS;
  const c = Math.floor(at / 5);
  const r = at % 5;
  return HASHTAG_GROUPS.map((group, s) => group.tags[(r + s * c) % 5]!);
}

const TAG_LINE = /^(#[^\s#]+\s*)+$/u;

/**
 * A caption with its hashtag line swapped for the post's experiment tags; unchanged before
 * the experiment. A caption with no tag line gets them on a line of their own.
 * @pure true
 */
export function withExperimentTags(caption: string, post: number): string {
  const tags = experimentTags(post);
  if (!tags) return caption;
  const lines = caption.trimEnd().split("\n");
  let at = -1;
  lines.forEach((line, i) => {
    if (TAG_LINE.test(line.trim())) at = i;
  });
  if (at === -1) return [...lines, "", tags.join(" ")].join("\n");
  lines[at] = tags.join(" ");
  return lines.join("\n");
}

/** One reading of one TikTok video, as the views reader (post-to-tiktok.ts --views) saw it. */
export type ViewSnapshot = {
  /** When it was read, ISO. */
  at: string;
  /** The calendar post it was matched to, or null when none matched. */
  post: number | null;
  views: number;
  /** TikTok's own age label: "5h ago", "2d ago", "11-14". */
  age: string;
  /** Its age in days from that label, or null when the label is a date. */
  ageDays: number | null;
  tags: string[];
  caption: string;
};

/**
 * Days from TikTok's age label ("3m ago", "5h ago", "2d ago", "1w ago"); null for a date
 * ("11-14"), which TikTok shows once a video is older than about a week.
 * @pure true
 */
export function parseAgeDays(label: string): number | null {
  const m = /(\d+)\s*([smhdw])\s*ago/i.exec(label);
  if (!m) return null;
  const n = Number(m[1]);
  const per: Record<string, number> = { s: 1 / 86_400, m: 1 / 1_440, h: 1 / 24, d: 1, w: 7 };
  return n * per[m[2]!.toLowerCase()]!;
}

/** "113", "1,204", "1.2K", "3M" (with or without " views") as a number; null otherwise. @pure true */
export function parseViews(text: string): number | null {
  const m = /^([\d.,]+)\s*([KM])?(\s*views?)?$/i.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const unit = m[2]?.toUpperCase();
  return Math.round(unit === "K" ? n * 1_000 : unit === "M" ? n * 1_000_000 : n);
}

/**
 * The post a video belongs to: the one whose experiment tag set equals the video's. Captions
 * from before the experiment are matched by the caller (their "Từ số N/365").
 * @param tags - the hashtags read from the video's caption
 * @param posts - the candidate posts, those TikTok has
 * @param tagsOf - a post's tag set on TikTok (default: its rotation tags)
 * @pure true
 */
export function matchSnapshot(
  tags: string[],
  posts: number[],
  tagsOf: (post: number) => string[] | null | undefined = experimentTags,
): number | null {
  const key = (list: string[]) => [...list].map((t) => t.toLowerCase()).sort().join(" ");
  const want = key(tags);
  const hits = posts.filter((p) => {
    const own = tagsOf(p);
    return !!own && key(own) === want;
  });
  // A set comes round again every ROUND_POSTS posts: the newest of those is the one still
  // being read (the caller passes only posts TikTok has).
  return hits.length ? Math.max(...hits) : null;
}

/** One tag's showing: its posts' mean log views against the mean of every measured post. */
export type TagEffect = {
  group: string;
  tag: string;
  /** Posts measured (at VIEWS_AGE_DAYS) that carried it. */
  posts: number;
  /** Their median views. */
  medianViews: number | null;
  /** Mean ln(views + 1) of its posts minus the overall mean: + is better. */
  effect: number | null;
  /** That as a ratio of views: 1.25 is about 25% more. */
  ratio: number | null;
};

/**
 * Each tag's effect, from the first snapshot of each post at VIEWS_AGE_DAYS or older.
 * @param snapshots - every reading, any order
 * @returns The tags by group, best first within a group, plus the posts measured
 * @pure true
 */
export function hashtagReport(snapshots: ViewSnapshot[]): {
  measured: { post: number; views: number; ageDays: number }[];
  effects: TagEffect[];
  best: string[];
} {
  const firstAtAge = new Map<number, ViewSnapshot>();
  for (const s of [...snapshots].sort((a, b) => a.at.localeCompare(b.at))) {
    if (s.post === null || s.ageDays === null || s.ageDays < VIEWS_AGE_DAYS) continue;
    if (!experimentTags(s.post) || firstAtAge.has(s.post)) continue;
    firstAtAge.set(s.post, s);
  }
  const measured = [...firstAtAge.values()]
    .map((s) => ({ post: s.post!, views: s.views, ageDays: s.ageDays! }))
    .sort((a, b) => a.post - b.post);
  const log = (v: number) => Math.log(v + 1);
  const overall = measured.length ? measured.reduce((sum, m) => sum + log(m.views), 0) / measured.length : 0;
  const effects: TagEffect[] = [];
  const best: string[] = [];
  for (const group of HASHTAG_GROUPS) {
    const rows = group.tags.map((tag): TagEffect => {
      const views = measured.filter((m) => experimentTags(m.post)!.includes(tag)).map((m) => m.views);
      if (!views.length) return { group: group.name, tag, posts: 0, medianViews: null, effect: null, ratio: null };
      const effect = views.reduce((sum, v) => sum + log(v), 0) / views.length - overall;
      return { group: group.name, tag, posts: views.length, medianViews: median(views), effect, ratio: Math.exp(effect) };
    });
    rows.sort((a, b) => (b.effect ?? -Infinity) - (a.effect ?? -Infinity));
    effects.push(...rows);
    if (rows[0]?.effect !== null && rows[0]) best.push(rows[0].tag);
  }
  return { measured, effects, best };
}

function median(list: number[]): number {
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}
