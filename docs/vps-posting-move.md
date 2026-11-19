# Moving the posting pipeline to a VPS

Status: plan, nothing built yet (2026-11-19). TikTok goes by route B (TikTok Studio), chosen 2026-11-19.

## Why

Every night failure so far came from the Mac, not the code: asleep on battery with the lid
shut, it ran the 02:30 publish and the 03:00 render in DarkWakes of a few seconds
(`pmset -g log`), so uploads timed out (posts 11–12 on Facebook and Instagram) and renders
never finished (posts 14–15 had no clip on 2026-11-19). A machine that is always on and
always online removes that whole class of failure.

## What moves and what stays

| Piece | Where | Why |
|---|---|---|
| Rendering clips + Instagram carousels | **VPS** | Headless Chrome on a slowed page clock (×0.25): needs CPU, not a GPU |
| Song proposals + mixing (ffmpeg) | **VPS** | Mixed clips must sit beside the clips they upload |
| Facebook / Instagram / YouTube publishing | **VPS** | Plain API calls on fixed times |
| Calendar + exported-words (the only writer) | **VPS** | The file lock (scripts/lib/locked-file) works within one machine only |
| `/posting` admin page | **VPS**, Tailscale only | It writes the calendar, so it runs where the calendar lives |
| TikTok | **TikTok Studio on the web, by you, once a week** | Route B, below; the emulator retires |

**TikTok stays off the VPS.** The emulator needs hardware virtualization that most VPSes
lack; the AVD is an arm64 image (an x86 server needs a fresh image and fresh Google and
TikTok sign-ins); and a new device on a datacenter IP that also looks like an emulator is
what TikTok tends to flag. You tap Post by hand anyway.

**Route B (chosen): TikTok Studio, no emulator.** Once a week you upload the VPS's next
clips in TikTok Studio on the web, each with its scheduled time, and TikTok posts them on
time by itself. No machine has to be awake, and nothing automates TikTok (no audit needed,
no emulator fingerprint). The calendar already has the `scheduled` status and
`mark <days> scheduled`; the clip filenames carry the date (`day-014-2026-11-19-reaction.mp4`).

What Studio gives up against the emulator, to check on the first batch:
- **Scheduling horizon**: Studio schedules only a limited window ahead (about 10 days at
  the time of writing; check), so the batch is weekly, not monthly.
- **Cover and location**: post-to-tiktok set both in the app; in Studio you pick the cover
  frame by hand, and location may not be offered on the web.
- **Hashtags**: keep at most 5 (MAX_HASHTAGS); the caption from `/posting` already does.
- Posts 13–15, drafted in the emulator on 2026-11-19, are posted from there as before; the
  first Studio batch starts after them.

Rejected, route A (emulator on the Mac, fed by the VPS): it keeps a daily 13:30 job that
needs the Mac awake and you at it, which is the dependency this move removes.

## Decisions for you

1. **Provider.** Any of Hetzner, DigitalOcean, Vultr. Singapore region. 4 vCPU (dedicated
   or "CPU-optimized" if the render is slow on shared), 8 GB RAM, 80 GB disk, Ubuntu 24.04.
   Roughly US$15–40/month depending on shared vs dedicated vCPU.
2. **Bot identity for git.** The VPS commits calendar records to `main`; a deploy key with
   write access on the repo, commits authored as e.g. `kinemedia-bot`.

## Phase 0 — accounts (you)

- Create the VPS with your SSH key (no password login).
- Install **Tailscale** on the VPS, the Mac and your phone; one tailnet. Name the VPS `kine`.
- Install **ntfy** on your phone and subscribe to a long random topic name (it is the only
  secret protecting the notifications; keep it out of git).
- **Reset the Meta app secret** before copying credentials anywhere (it was shared in chat
  on 2026-11-16).
- On your phone, an SSH app (Termius or Blink) pointed at `kine` over Tailscale.
- Check TikTok Studio on the web (tiktok.com/tiktokstudio) with the channel account: upload,
  schedule, how far ahead it lets you pick a date, and whether location is offered.

## Phase 1 — server base (I can script this; you run it with sudo)

- User `kine`, sudo, SSH keys only; `ufw` denies all incoming except on `tailscale0`
  (SSH and `/posting` are reachable only over Tailscale).
- `unattended-upgrades`; timezone `Asia/Ho_Chi_Minh` (calendar times are Vietnam's).
- Node 24 (the Mac runs 24.13), Google Chrome stable (.deb), ffmpeg, `fonts-noto`,
  `fonts-noto-color-emoji`, git, tmux, rsync.
- `git clone`, `npm ci`, a deploy key for push.
- `loginctl enable-linger kine` so the user's systemd timers run with nobody logged in.
- 2 GB swap: two Vite servers plus Chrome can spike past 8 GB.

## Phase 2 — code changes (I do these, on main, tested on the Mac first)

1. **Chrome path** — scripts/lib/cdp.ts and scripts/walk-page-fonts.ts hard-code the macOS
   app path: take `CHROME_PATH`, else the platform's default (`/usr/bin/google-chrome`).
2. **Notifications** — tiktok-auto `notify()`: send to ntfy when `NTFY_TOPIC` is set
   (`.env.local`), osascript on macOS as now. Both, when both are available.
3. **systemd timers** — `tiktok-auto install` writes user units on Linux instead of launchd
   plists: `OnCalendar=*-*-* 13:30:00 Asia/Ho_Chi_Minh`, `Persistent=true` (a missed run
   catches up). `status` reads `systemctl --user` and `journalctl`. Drop the `pmset` hints there.
4. **Server jobs without the emulator** — `render` (03:00) keeps **14 days** of clips
   rendered ahead (today 6), so a weekly Studio batch always has its clips; `prepare`
   (12:00: render anything due within 24 h without a clip, propose songs — today's draft job
   minus draft-due); `publish` (post times). The `draft` job and its emulator steps stay in
   the code but are not installed on the server.
5. **A TikTok batch view on `/posting`** — the next unscheduled posts with a rendered clip,
   each with: **Download** (the clip with `Content-Disposition: attachment`, named by date),
   **Copy caption** (the calendar caption, hashtags already capped at 5), the slot to pick in
   Studio (date and time, Vietnam), and **Scheduled ✓** (runs `mark N scheduled`). Works from
   the Mac's browser over Tailscale. `status` keeps warning when fewer than 3 days are
   scheduled; that warning also goes to ntfy once a day.
6. **Git under the lock** — every server job starts with `git pull --rebase` while holding
   the run lock (a pull that changes `src/` mid-take reloads Vite and blanks the clip), and
   ends by committing `scripts/data/tiktok-calendar.json` + `exported-words.json` if they
   changed and pushing. A rejected push retries once after a pull; a conflict stops and
   notifies instead of forcing.
7. **`/posting` server** — a systemd service running `npm run dev -- --host <tailscale IP>
   --port 5182`, separate from the render's own `:5195` server, so a page reload never
   touches a take.

## Phase 3 — data and secrets (you, guided)

- `scp .env.local kine:~/KineMedia/` then `chmod 600`. The YouTube refresh token and the Meta
  Page token are not tied to a machine; nothing to sign in again.
- `rsync -a ~/KineMedia-tiktok/ kine:~/KineMedia-tiktok/` (about 250 MB: clips, sounds).
- New songs you download on the Mac: `rsync` them up (a one-line script), or Syncthing on both.

## Phase 4 — trial run, then cutover

1. On the VPS, render one past post into a scratch folder and compare with the Mac's clip:
   duration, the render's "distinct frames" line (must stay 100%), fonts and emoji. Time it:
   the Mac takes ~1 min per post; much over 5 min means a bigger or dedicated-CPU plan.
2. `publish-due --dry-run` on the VPS at one post time: every step listed, nothing sent.
3. Cutover, in this order, so nothing publishes twice:
   1. Mac: `npx tsx scripts/tiktok-auto.ts uninstall`; commit and push the calendar.
   2. VPS: `git pull`, `tiktok-auto install`.
   3. First Studio batch from `/posting` on the VPS, starting after the posts already in
      the emulator; `mark … scheduled` as each goes in.
   4. When the emulator's last draft is posted, shut it down (`adb emu kill`). Keep the AVD
      for a month in case Studio falls short, then delete it.
4. Watch the first night's runs in ntfy; the duplicate guard (look before sending, and look
   again after an errored upload) still protects each post.

## Remote control, day to day

| Want to | Do |
|---|---|
| See what's due, accept songs, publish by hand | `http://kine:5182/posting` on phone or Mac (Tailscale) |
| Status and last logs | `ssh kine` → `npx tsx scripts/tiktok-auto.ts status` |
| A long manual run | `ssh kine`, `tmux new -A -s posting`, run it, detach; reattach later |
| Know when something fails | ntfy on the phone |
| Schedule TikTok | Once a week, `/posting` → TikTok batch → download, copy caption, schedule in Studio, tap Scheduled |

## Risks

- **Render speed on shared vCPUs**: measured in Phase 4 step 1 before anything moves.
- **Fonts**: the measured layout steps down and never back up, so a missing font makes
  smaller text, not an error. The side-by-side check catches it.
- **Two writers**: if the Mac ever runs `tiktok.ts mark/publish` locally after cutover, the
  calendars diverge. After cutover those run over `ssh kine` or on `/posting`.
- **A missed weekly batch**: TikTok then simply has no post that day. The daily
  "fewer than 3 days scheduled" ntfy warning is the reminder; Facebook, Instagram and
  YouTube keep going regardless.
