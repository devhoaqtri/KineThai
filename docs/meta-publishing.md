# Publishing to Facebook and Instagram

Each calendar post goes out as a **Reel on the Facebook Page** and a **Reel on Instagram** at its
time, through Meta's official Graph API, from this Mac. TikTok stays on its own track (drafts in
the emulator). Manage everything at **http://localhost:5195/posting** under `npm run dev`.

## What runs

- `npm run tiktok -- publish-due`: publishes every post whose time has come (up to 6 hours late) on each
  connected platform. launchd runs it every 10 minutes (`com.kinemedia.tiktok-publish`, installed by
  `npx tsx scripts/tiktok-auto.ts install`). It writes no log and shows no notification when nothing is due.
- `npm run tiktok -- publish <post> [--platform facebook|instagram|all] [--dry-run]`: one post, now.
  The page's **Publish now** and **Retry** buttons run this.
- A failure is retried by the job up to 3 times, then waits on the page with Meta's own message.
- What went out is recorded in `scripts/data/exported-words.json`, so the word is never planned again.

## One-time setup (about 15 minutes, all by you, in a browser)

1. **Instagram professional account.** In the Instagram app: Settings → Account type and tools →
   switch to a **Creator** or **Business** account.
2. **Link it to the Facebook Page.** Meta Business Suite → Settings → Accounts → Instagram accounts →
   Connect. (The Page is what Facebook Reels post to; a personal profile cannot.)
3. **Create a Meta app.** https://developers.facebook.com/apps → Create app → use case
   *"Manage everything on your Page"* (or type **Business**). Add **Facebook Login for Business** and
   **Instagram Graph API** (Instagram API with Facebook Login) if asked. The app can stay in
   **development mode**: it only posts to accounts you manage, so no App Review is needed.
4. **Copy the app's id and secret** (App settings → Basic) into `.env.local` (git-ignored):

   ```
   META_APP_ID=…
   META_APP_SECRET=…
   ```

5. **Get a user token.** https://developers.facebook.com/tools/explorer → pick your app → *Get User
   Access Token* with these permissions:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `publish_video`,
   `business_management`, `instagram_basic`, `instagram_content_publish`.
   Paste it into `.env.local` as `META_USER_TOKEN=…` (it is short-lived; the next step spends it).
6. **Connect:**

   ```bash
   npm run tiktok -- meta-setup
   ```

   It swaps the user token for the Page's token (which does not expire), finds the Instagram account
   linked to the Page, writes `META_PAGE_ID`, `META_PAGE_TOKEN` and `META_IG_USER_ID` into
   `.env.local`, and removes `META_USER_TOKEN`. With several Pages, add `--page "<name or id>"`.
7. **Check it**, without posting anything, then for real on one post:

   ```bash
   npm run tiktok -- publish 5 --dry-run
   ```

   On /posting both platforms now read *connected*.

## Notes

- Captions: each post uses the calendar caption; the page can give Facebook or Instagram its own.
- Instagram's cover frame is the clip's letter hint, the same frame the TikTok draft uses.
- Facebook Reels must be 3–90 s; our clips are about 52 s.
- `META_GRAPH_VERSION` (default `v23.0`) pins the Graph API version; `META_DRY_RUN=1` makes every
  publish a dry run.
- If Meta ever refuses the token (password change, removed permission), run step 5 and 6 again.
