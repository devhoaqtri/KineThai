# Posting pipeline: handoff for the next agent

Read this first when asked to work on posting clips to TikTok, Facebook or Instagram, or on the
songs under the Facebook Reels. It covers what exists, how a day runs, the rules the owner has set,
where everything lives, and what is still open. As of 2026-11-17.

Deeper references: [meta-publishing.md](meta-publishing.md) (Meta setup, publishing, songs) and the
header comments of `scripts/tiktok.ts`, `scripts/tiktok-auto.ts` and `scripts/lib/music-mix.ts`.

## What it does

One English word a post, from a 365-post calendar (`scripts/data/tiktok-calendar.json`). Each post is a
rendered clip of the reader's word card (the clip itself is silent) and goes out on three platforms:

| Platform | What goes out | How |
|---|---|---|
| TikTok | the clip | saved as a **draft** in the "TikTokPoster" Android emulator; the owner taps Post by hand |
| Facebook Page "Anh.ChayLá" | the clip as a **Reel**, with a song from Meta's Sound Collection mixed in | Meta Graph API, at the post's time |
| Instagram "anh.chayla" | a **carousel** of the word's finished pages (still images), never the video | Meta Graph API, at the post's time |
| YouTube | the clip as a **Short**, with a song from YouTube's Audio Library mixed in | YouTube Data API v3, at the post's time; private until Google audits the project ([youtube-publishing.md](youtube-publishing.md)) |

Schedule: the first 7 days (2026-11-15 → 11-21) have 3 posts a day at 11:30, 19:00, 21:30 Vietnam
time; after that one a day at 19:00. The Mac runs on UTC+7, so launchd's local time is Vietnam time.

## A day, unattended

| When (Mac time) | launchd job | What it does |
|---|---|---|
| 03:00 | `com.kinemedia.tiktok-render` | renders clips + carousels for the next 6 planned posts (starts its own dev server on :5195) |
| 07:00 | `com.kinemedia.tiktok-draft` | renders anything due without a clip, **proposes a song** for each Facebook post due within 24 h (`music-due`), then saves every due post as a TikTok draft |
| each post time (11:30, 19:00, 21:30) | `com.kinemedia.tiktok-publish` | publishes what is due on Facebook and Instagram (`publish-due`); a post whose song is not accepted waits |

Every run logs to `logs/tiktok-auto/<date>-<job>.log` and shows a macOS notification. launchd runs
a missed time when the Mac wakes but **cannot wake a sleeping Mac**. The 03:00/07:00 renders have
failed overnight with the lid closed; check `pmset -g log` first when a night run fails.

What the owner does by hand: tap Post on each TikTok draft in the emulator (then paste its link on
`/posting`, "Mark posted"), and **Accept each Facebook song** on `/posting`.

## Facebook songs (added 2026-11-17)

Meta's Reels API takes no music, and the clips are silent, so `scripts/lib/music-mix.ts` mixes a
track into a copy of the clip before upload: video copied untouched, song looped to the clip's
length from `startSec`, faded in/out, levelled to -14 LUFS, written to
`<clip>.facebook.mp4` beside the clip (`mixedClipPath`).

- **Library**: `~/KineMedia-tiktok/sounds/` (or the calendar's `soundsDir`). File name = title shown,
  saved as `Title - Artist.m4a`. Holds 8 upbeat instrumentals today (0:58–3:31).
- **Proposal**: `pickSong` takes a song never used on Facebook, else the one used longest ago; ties
  vary by post number. Stored on the post as `platforms.facebook.music = { song, startSec, status,
  at }` (`PostMusic` in `scripts/lib/tiktok-calendar.ts`).
- **The gate**: a `proposed` song **holds** the post (`musicHolds`); `postsToPublish` skips it and
  `postsAwaitingMusic` reports it. `accepted` lets it go. `song: null` accepted = no music.
  Accepting after the slot publishes at once (within the 6-hour grace).
- **No proposal = no hold**: with an empty sounds folder, posts go out silent as before.
- **Instagram** stays silent: it posts carousels. Meta's Instagram Audio API can attach licensed
  music to *Reels* only. TikTok sounds are picked in the TikTok app (record in
  `scripts/data/tiktok-sounds.json`).

### Getting more songs

1. Meta Business Suite → All tools → Sound Collection, or open directly:
   `https://business.facebook.com/sound/collection/?business_id=1185974383786070`
   (the old `facebook.com/sound/collection` and Creator Studio links are dead ends).
2. In the built-in browser the owner must sign in to Facebook themselves; never type the password.
   The Sound Collection link in the menu opens a new tab, which the pane blocks: navigate to the
   URL above instead.
3. Filters used so far: Mood "Vô tư" (carefree), Vocals "Không có giọng hát" (none). Instrumentals
   suit a word-guessing clip. Ask the owner before downloading, listing each track.
4. The ⬇ icon on a row downloads an **audio-only `.mp4`** (AAC, ~48 kbps) to `~/Downloads`. Move it
   to `~/KineMedia-tiktok/sounds/Title - Artist.m4a` (`.mp4` is accepted too).

## Commands

```bash
npm run tiktok:status                         # calendar overview, what needs attention
npx tsx scripts/tiktok-auto.ts status         # launchd jobs, today's logs, publish times vs calendar
npm run tiktok -- music                       # list the songs
npm run tiktok -- music 10                    # propose (and mix) a song for post 10
npm run tiktok -- music 10 --song "Groovy Hat - erloom.m4a" --start 12
npm run tiktok -- music 10 --song none        # no music
npm run tiktok -- music accept 10
npm run tiktok -- music-due --hours 24        # what the 07:00 job runs
npm run tiktok -- publish 10 --platform facebook --dry-run
npm run tiktok -- publish-due --dry-run
npx tsx scripts/tiktok-auto.ts install        # rewrite + reload the launchd jobs
```

`/posting` (dev only, `npm run dev`, http://localhost:5195/posting) does the same per post: the clip
with "With song / As rendered", captions, TikTok link, Facebook/Instagram Publish now / Skip, and the
**♪ Song** row (pick, start, Mix, Accept).

## Rules the owner has set (do not break)

- Only **B1 and harder** words go out anywhere (`MIN_POST_LEVEL`, `isPostLevel`).
- Instagram posts a **carousel**, never the video. Facebook posts the Reel.
- Instagram is the channel account **anh.chayla**, never the owner's personal @phdong12. Facebook is
  the Anh.ChayLá Page (1850058198626898), never the restaurant Page.
- **No word goes out twice**: `scripts/data/exported-words.json` records every export; `plan`/`swap`
  skip listed words.
- Captions never name the word ("Từ số N/365").
- Publish times are **fixed slots from the calendar**, not a poll (owner's choice 2026-11-17). They
  are read when the job is installed: rerun `tiktok-auto.ts install` when times change, including
  after the burst ends on 2026-11-21 (leftover 11:30/21:30 runs are harmless; they find nothing).
- A Facebook song is heard and **accepted by the owner** before the post goes out.
- When work is done: commit and push to `main`, split by topic.

## Where things live

| Path | What |
|---|---|
| `scripts/data/tiktok-calendar.json` | the calendar: every post, its status, clip, carousel, per-platform tracks and music |
| `scripts/lib/tiktok-calendar.ts` | pure logic: schedule, `postsToPublish`, `postsAwaitingMusic`, `pickSong`, `publishTimes` (tests in `src/features/vocabulary/lib/__tests__/tiktok-calendar.test.ts`) |
| `scripts/tiktok.ts` | the CLI (`npm run tiktok -- …`): plan, render, draft, publish, music |
| `scripts/tiktok-auto.ts` | the launchd jobs: render, draft, publish, install, status |
| `scripts/lib/music-mix.ts` | song library + ffmpeg mix |
| `scripts/lib/meta-publish.ts` | Graph API: Reel upload, Instagram carousel |
| `scripts/post-to-tiktok.ts` | drives the emulator to save a TikTok draft |
| `src/features/vocabulary/components/PostingPage.tsx`, `api/posting.server.ts`, `src/routes/api/dev/posting.ts` | the `/posting` page (dev only; 404 in production) |
| `~/KineMedia-tiktok/clips/` | clips, `<clip>.facebook.mp4` mixes, `carousels/` |
| `~/KineMedia-tiktok/sounds/` | the song library |
| `~/Library/LaunchAgents/com.kinemedia.tiktok-*.plist` | the installed jobs |
| `.env.local` | Meta credentials (never-expiring Page token); never print or commit them |

## How to check a change

- `npx vitest run src/features/vocabulary/lib/__tests__/tiktok-calendar.test.ts`
- Mixing: `npm run tiktok -- music <post>`, then `ffprobe` the `.facebook.mp4` (video + one AAC
  stream, clip's length) and `ffmpeg -af ebur128` (about -14 LUFS).
- The gate: `npm run tiktok -- publish <post> --platform facebook --dry-run` must refuse a proposed song.
- When testing on the real calendar, back it up first and restore it, and delete test mixes, so a
  test song never holds a real post.
- `/posting` in the browser pane: the song row only shows on posts from today on that have a clip.

## Open items

- A Facebook post that fails at **21:30** is not retried automatically (next slot is past the 6-hour
  grace); the owner retries from `/posting`. A 19:00 failure is retried at 21:30.
- Post 6 is live on TikTok but still `drafted` in the calendar; it needs `mark 6 posted --url …`.
- Business Suite lists **two Facebook entries** per post for posts 6 and 7 (one Reel with a
  duration, one without, marked "can't be promoted"). Not yet investigated: possibly the
  Instagram carousel's temporary Page photos, which should be deleted after posting.
- YouTube Shorts code is in (2026-11-17, `scripts/lib/youtube-publish.ts`); connecting it needs the
  owner's Google Cloud OAuth client and `youtube-setup` (docs/youtube-publishing.md), and uploads stay
  private until Google's audit. YouTube songs come from its own Audio Library (Meta's tracks are
  licensed for Meta's apps only), in `~/KineMedia-tiktok/sounds-youtube/`.
- Sound Collection tracks are low bitrate (~48 kbps AAC); fine on phones, but look for a higher
  quality download option if the owner asks.
