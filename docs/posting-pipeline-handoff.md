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
| YouTube channel "Anh.ChayLá" (@anh.chayla) | the clip as a **Short**, with a song from YouTube's Audio Library mixed in | YouTube Data API v3, at the post's time ([youtube-publishing.md](youtube-publishing.md)) |

Schedule: the first 7 days (2026-11-15 → 11-21) have 3 posts a day. Since 2026-11-18 they go out at
13:30, 20:30 and **02:30 the night after** (`npm run tiktok -- times --burst-times 13:30,20:30,02:30`;
a time earlier than the one before it rolls to the next date, `midnightIndex`). Posts 1–9 keep the
11:30/19:00/21:30 they went out at: a schedule change never re-dates a post that has gone out
(`settled`). After the burst, one a day at 19:00 (Vietnam). The Mac runs on UTC+7, so launchd's
local time is Vietnam time.

## A day, unattended

| When (Mac time) | launchd job | What it does |
|---|---|---|
| 03:00 | `com.kinemedia.tiktok-render` | renders clips + carousels for the next 6 planned posts (starts its own dev server on :5195) |
| 13:30 | `com.kinemedia.tiktok-draft` | renders anything due without a clip, **proposes a song** for each Facebook post due within 24 h (`music-due`), saves every due post as a TikTok draft (booting the emulator itself if it is off), then publishes whatever is due (a clip it just rendered missed its own publish run) |
| each post time (02:30, 13:30, 20:30; 19:00 after the burst) | `com.kinemedia.tiktok-publish` | takes no lock, so it never waits behind the draft run; publishes what is due on Facebook and Instagram (`publish-due`); a post whose song is not accepted waits |

Every run logs to `logs/tiktok-auto/<date>-<job>.log` and shows a macOS notification. launchd runs
a missed time when the Mac wakes but **cannot wake a sleeping Mac**. The 03:00 render (and the old 07:00 draft run) have
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

## TikTok hashtag experiment (added 2026-11-22)

TikTok keeps 5 hashtags, so each TikTok post carries one tag from each of five groups of five
(`scripts/lib/hashtag-experiment.ts`, `HASHTAG_GROUPS`): broad learn-English, vocabulary, exams,
quiz, discovery. From post 22 the set rotates as an orthogonal array: in one round of 25 posts
every tag goes out 5 times and every pair of tags from two groups exactly once, so each tag's
effect is its posts' mean log views against the round's. Only TikTok's caption changes
(`tiktokCaption` in `tiktok.ts`); Facebook, Instagram, YouTube and Threads keep the fixed tags.

- **Views:** the 13:30 draft job runs `npm run tiktok -- views` once the emulator is up. It opens each video on the
  profile, reads its caption, views and age, and appends to `scripts/data/tiktok-views.ndjson`. A video
  is matched by "Từ số N/365", else its `/w/<code>` link, else its tag set (`tiktokTags`, written when drafted);
  a matched post still `drafted` is marked `posted`.
- **Report:** `npm run tiktok -- hashtags`. Each post is measured at its first reading 3 days old
  (`VIEWS_AGE_DAYS`). Do not trust it before a full round (25 measured posts, about a month at one a day).
- **Retag test (2026-11-22):** `npm run tiktok -- retag 6-20` edited the hashtag line of the videos already on
  TikTok (Edit post; only the tag line changes). Even posts got rotation sets from the round's far end; odd
  posts are the control, edited with their own tags reversed, because an edit alone may get a video shown
  again. `hashtags` prints both arms' view growth since the edit. TikTok allows **one edit a day, within 7
  days of posting**; `--dry-run` pastes and checks, then cancels. Edited: retag 8, 10, 12, 14, 16, 18, 20;
  control 9, 11, 13, 15, 17, 19. Posts 6 and 7 were already past the window (their Edit post screen says
  only the location can change, and a paste into the description is ignored).
- If the emulator shows "Process system isn't responding", restart it (`adb emu kill`, wait until no
  `qemu-system` process is left, then boot); a second emulator on the same AVD refuses to start.

## Commands

```bash
npm run tiktok:status                         # calendar overview, what needs attention
npx tsx scripts/tiktok-auto.ts status         # launchd jobs, today's logs, publish times vs calendar
npm run tiktok -- music                       # list the songs
npm run tiktok -- music 10                    # propose (and mix) a song for post 10
npm run tiktok -- music 10 --song "Groovy Hat - erloom.m4a" --start 12
npm run tiktok -- music 10 --song none        # no music
npm run tiktok -- music accept 10
npm run tiktok -- music-due --hours 24        # what the 13:30 job runs
npm run tiktok -- times --burst-times 13:30,20:30,02:30   # move post times, then reinstall the jobs
npm run tiktok -- publish 10 --platform facebook --dry-run
npm run tiktok -- publish-due --dry-run
npx tsx scripts/tiktok-auto.ts install        # rewrite + reload the launchd jobs
npm run tiktok -- views                       # read every TikTok video's views (emulator)
npm run tiktok -- hashtags                    # the hashtag experiment so far
npm run tiktok -- retag 6-20 --dry-run        # edit posted videos' hashtags (checks only)
```

`/posting` (dev only, `npm run dev`, http://localhost:5195/posting) does the same per post: the clip
with "With song / As rendered", captions, TikTok link, Facebook/Instagram Publish now / Skip, and the
**♪ Song** row (pick, start, Mix, Accept).

## Rules the owner has set (do not break)

- Only **B1 and harder** words go out anywhere (`MIN_POST_LEVEL`, `isPostLevel`).
- Instagram posts a **carousel**, never the video. Facebook posts the Reel.
- Instagram is the channel account **anh.chayla**, never the owner's personal @phdong12. Facebook is
  the Anh.ChayLá Page (1850058198626898), never the restaurant Page. YouTube is the **Anh.ChayLá**
  channel (UC8Sy1JlzVMRH7IjLJTi3lBA), never the owner's personal "Do Phuong Dong".
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
| `scripts/post-to-tiktok.ts` | drives the emulator to save a TikTok draft; `--views` reads views, `--retag` edits posted captions |
| `scripts/lib/hashtag-experiment.ts`, `scripts/data/tiktok-views.ndjson` | the hashtag pool, rotation and report; every views reading |
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
- YouTube is connected (2026-11-17) to the Anh.ChayLá channel; the first Short (post 7) went out
  public. The Google app is In production (privacy page at anh.chayla.app/privacy), so the token lasts;
  if uploads ever fail with `invalid_grant`, rerun `youtube-setup` and pick Anh.ChayLá. YouTube has no
  songs yet: download from YouTube Studio's Audio Library into `~/KineMedia-tiktok/sounds-youtube/`
  (never Meta's tracks: Meta-only licence).
- Sound Collection tracks are low bitrate (~48 kbps AAC); fine on phones, but look for a higher
  quality download option if the owner asks.
