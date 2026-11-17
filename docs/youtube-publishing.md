# Publishing to YouTube (Shorts)

Each calendar post also goes out as a **YouTube Short** at its time, through the official YouTube Data
API v3, from this Mac (`scripts/lib/youtube-publish.ts`). It rides the same machinery as Facebook and
Instagram ([meta-publishing.md](meta-publishing.md)): the post's `platforms.youtube` track on the
calendar, the publish job at each post time, and the YouTube row on `/posting`.

- **Video**: the rendered clip (9:16, under a minute, so YouTube files it as a Short), with a song from
  YouTube's own Audio Library mixed in when one is accepted.
- **Title**: `Từ gì mà ... 🤔 Từ số N/365 · B1 #shorts` (`youtubeTitle`; never the word).
- **Description**: the calendar caption (or the post's "YouTube only" caption). Category Education,
  language Vietnamese, not made for kids.

## Channel, and the private lock

Shorts go to the **Anh.ChayLá** channel (@anh.chayla, UC8Sy1JlzVMRH7IjLJTi3lBA), a Brand Account managed
by the owner's Google account, **never** the owner's personal channel "Do Phuong Dong". At the sign-in,
pick Anh.ChayLá when Google asks which account or channel; `youtube-setup` prints the channel it
reached, so check it before any upload.

Google's documentation says uploads from an API project it has not audited are locked to private. The
first upload (post 7, 2026-11-17) came back **public** and processed, so the lock has not applied so far.
If it ever does, the publish still succeeds, the calendar records `privacy: "private"`, `/posting`
shows a "private" chip, and the fix is Google's **YouTube API Services – Audit and Quota Extension** form
(it needs the privacy policy page below).

Quota: an upload costs 1,600 of the default 10,000 units a day, so about 6 uploads a day.

## One-time setup (owner, in a browser)

1. **Google Cloud project**: https://console.cloud.google.com → new project (e.g. `anh-chayla-posting`).
2. **Enable the API**: APIs & Services → Library → *YouTube Data API v3* → Enable.
3. **OAuth consent screen** (Google Auth Platform): user type *External*, app name, support email,
   contact email; the owner ticks Google's User Data Policy. Done 2026-11-17 for project
   `anh-chayla-posting` (app "Anh ChayLa Poster", client "KineMedia posting Mac").
   On 2026-11-17 the Branding page got the home page `https://anh.chayla.app`, the privacy policy
   `https://anh.chayla.app/privacy` (src/routes/privacy.tsx) and the domain `chayla.app`, and the app
   was moved to **In production**, so its refresh token no longer expires after 7 days. It is not
   verified, so the sign-in shows Google's "unverified app" warning (continue past it); that is fine
   for the owner's own use, up to 100 users ever.
4. **OAuth client**: Credentials → Create credentials → OAuth client ID → *Desktop app*. Put its id and
   secret in `.env.local` (git ignores it):
   ```
   YT_CLIENT_ID=…apps.googleusercontent.com
   YT_CLIENT_SECRET=…
   ```
5. **Sign in**: `npm run tiktok -- youtube-setup` opens Google's consent page in the default browser.
   Pick the Google account (or brand account) that owns the channel. The command stores
   `YT_REFRESH_TOKEN` in `.env.local` and prints the channel it reached.

Optional: `YT_PRIVACY=unlisted|private` asks for less than public; `YT_DRY_RUN=1` sends nothing.

## Songs

Meta's Sound Collection is licensed for Meta's apps only, so YouTube has its own library:

- YouTube Studio → **Audio library** → filter *No attribution required* (attribution tracks need a
  credit line in the description) → download MP3s into `~/KineMedia-tiktok/sounds-youtube/`
  (or the calendar's `youtubeSoundsDir`), named `Title - Artist.mp3`.
- From then on the 07:00 job proposes a song for each YouTube post too, and the post waits for
  **Accept** on `/posting` (the ♪ YouTube row), exactly like Facebook. With no songs, Shorts go out silent.
- By hand: `npm run tiktok -- music 10 --platform youtube [--song <file|none>] [--start 12]`, then
  `npm run tiktok -- music accept 10 --platform youtube`.

## Commands

```bash
npm run tiktok -- youtube-setup
npm run tiktok -- publish 10 --platform youtube --dry-run
npm run tiktok -- publish 10 --platform youtube
npm run tiktok -- publish-due --dry-run          # every connected platform
```

The publish job (`com.kinemedia.tiktok-publish`) needs no reinstall: it publishes on every connected
platform at each post time, and YouTube counts as connected once `YT_REFRESH_TOKEN` is set. A post
still within its 6-hour grace when YouTube is connected goes out at the next post time.
