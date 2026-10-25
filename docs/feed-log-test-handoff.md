# HANDOFF: test the feed log, and use it to hunt the mobile background flash

**For:** an agent (or a person) who can run the app and drive it — headless Chrome, a phone
on the LAN, or both — and report back what the log shows.
**Code:** `src/features/vocabulary/lib/feed-log.ts` (client), `src/routes/api/dev/feed-log.ts`
and `src/features/vocabulary/api/feed-log.server.ts` (dev-only endpoint), hooks in
`components/VocabularyCard.tsx` and `hooks/useVocabularyWindow.ts`. Landed in `f76c693`.

**Status in one line:** the log is in and verified with a 30-second headless session. What
is missing is (1) a check that it holds up over a long session and on a real phone, and (2)
a reading of a real phone session to confirm the background flash between words is gone
since `c3deabc` — or to find what is still causing it.

---

## 1. What the log is

In a **development** build the feed records what it does and posts it in batches (every 2 s,
or every 60 entries, and on `pagehide`) to `POST /api/dev/feed-log`. The dev server appends
each entry as one JSON line to:

```
logs/feed-<local date>.ndjson        # e.g. logs/feed-2026-10-26.ndjson; logs/ is gitignored
```

Every line has `session` (one id per page load), `t` (milliseconds since that session began —
the time counter) and `ev` (the event). A **production** build never logs: the logger is gated
on `import.meta.env.DEV` and the route answers 404 outside development.

| `ev`                 | When                                            | Fields                                                                                                  |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `session`            | first event of a page load                      | `at`, `ua`, `viewport`, `dpr`, `cores`, `memoryGb`, `network`, `touch`                                  |
| `word`               | a word becomes the one on screen                | `word`, `id`, `level`, `theme`, `tone`, `backdrop` (strip/scene/pattern/static), `pages`                |
| `leave`              | that word stops being on screen                 | `word`, `shownMs`, `lastPage`, `lastStage`                                                              |
| `page`               | a page / stage change of the word on screen     | `word`, `page`, `stage`, `replay`                                                                       |
| `move`               | the stream changes word                         | `cause` (`auto` / `swipe` / `keyboard` / `step`), `from`, `to`, plus `deferred` or `onScreen` + `glide` |
| `settle`             | a swipe's scroll comes to rest                  | `to`, `offBy` (px it was off the card's edge before being corrected)                                    |
| `advance-skipped`    | a word finished after the reader had moved on   | `finished`, `onScreen`                                                                                  |
| `touch-during-glide` | a finger landed while a swipe was still gliding | `to`                                                                                                    |
| `hitch`              | a frame took more than 50 ms                    | `ms`, `word`                                                                                            |
| `longtask`           | a main-thread task over 50 ms (Chromium only)   | `ms`, `word`                                                                                            |
| `visibility`         | the tab was hidden / shown                      | `state`                                                                                                 |
| `error`              | an uncaught error or rejected promise           | `message`, `source`, `line`                                                                             |

Development runs every effect twice; the hooks absorb that, so a healthy log has **no**
`leave` under ~50 ms and **no** two identical `page` lines. If you see either, that is a bug in
the log, not in the feed — report it.

## 2. Running a session

The dev server listens on every interface, so a phone on the same Wi-Fi can reach it.

```bash
npm run dev -- --port 5195
```

- **On a phone:** open `http://<this machine's LAN IP>:5195/feed` (the IP is
  `ipconfig getifaddr en0` on macOS). Plain http on a LAN address is allowed by the bot gate
  (it falls back to a same-origin Referer there). Use the feed normally. **Note the rough time
  of anything odd you see** ("about 2:40 in, while swiping fast") — it lines up with `t`.
- **Headless:** the recipe in the project memory "Headless layout measurement" applies —
  `puppeteer-core` at `/usr/local/lib/node_modules/puppeteer-core/...`, Chrome at
  `/Applications/Google Chrome.app/...`. Set `localStorage["kinetic.orientation.gate"]="off"`
  and `localStorage["kinetic.vocab.difficulty"]=""` before load. Use a mobile viewport
  (`390x844`, `deviceScaleFactor: 3`, `isMobile`, `hasTouch`). Swipe with CDP
  `Input.dispatchTouchEvent` (start at y≈600, eight moves of −45 px, end); do not use
  `touchscreen.tap`, it fires twice. To fit many words into a short run, scale `setTimeout`
  delays of 1–20 s by 0.06.

Start from an empty log so the file holds only your run: `rm -f logs/feed-*.ndjson`.

**Every open tab with the feed writes to the same file** — a forgotten browser tab, an IDE's
preview pane, another agent's headless run. Each has its own `session` id, and the `session`
line says which device it was (`viewport`, `dpr`, `touch`, `ua`), so close the others before
you start, and when reading, keep to your own session:

```bash
# which sessions are in the file, and on what device
jq -r 'select(.ev=="session") | "\(.session)  \(.viewport) dpr=\(.dpr) touch=\(.touch)"' logs/feed-*.ndjson
# keep one
jq -c 'select(.session=="<id>")' logs/feed-*.ndjson > /tmp/one-session.ndjson
```

## 3. What to test

### A. The log itself

1. **A long session.** At least 10 minutes on a phone (or 3 minutes headless with sped-up
   timers): mostly auto-advance, then a burst of fast swipes, then a few slow swipes, then
   lock the phone for 30 s and come back. Expect: one `session`; a `word`/`leave` pair for
   every word; `shownMs` that add up to roughly the session length (minus hidden time); every
   `move` followed within ~100 ms by a `leave` and a `word`; `visibility` hidden/visible around
   the lock; nothing lost across the lock (the batch is beaconed on `pagehide`).
2. **Reload mid-session.** Expect a second `session` id and nothing interleaved or truncated.
3. **Production is silent.** Build for production and serve it (`npm run build`, then the
   built server — check how this project serves a build; `vite preview` may not run the
   server routes), use the feed for a minute: no `logs/` file appears, and
   `curl -X POST <host>/api/dev/feed-log` returns 404.
4. **Size.** Note the file's size per minute of use. It should be a few KB per minute.

### B. The mobile background flash (the reason the log exists)

Before `c3deabc` every card's colour strip was one GPU layer ~88,000 device px wide on a
phone, and the strip's tiles arrived late as it moved, flashing other stretches of colour
between words. That commit paints the strip into a card-sized box instead. The log cannot
see a flash directly — it records what the feed did — so the test is: **run on a real phone,
watch for flashes, note their times, then read the log around those times.**

Things in the log that would explain a flash:

- a `hitch` (especially > 100 ms) within ~300 ms of a `move` — the page could not paint in
  time while changing word;
- a `leave` with a small `shownMs` (< ~300 ms) that was not a deliberate fast swipe — a word
  that only flickered through;
- two `move`s within ~200 ms, or a `touch-during-glide` — two drivers fighting the scroll;
- `settle` with a large `offBy` (more than a few px) — the swipe stopped between cards and
  was snapped;
- `advance-skipped` — a late auto-advance (harmless by design, but worth counting);
- a pattern by `backdrop`, `theme` or `tone` — e.g. flashes only on `strip` backdrops, or only
  on light cards.

## 4. Reading the log

```bash
# events per type
jq -r .ev logs/feed-*.ndjson | sort | uniq -c | sort -rn

# the timeline of word changes, with causes and time on screen
jq -c 'select(.ev|test("^(word|leave|move|settle|advance-skipped|touch-during-glide)$"))
       | {t, ev, word, cause, from, to, shownMs, offBy}' logs/feed-*.ndjson

# hitches over 100 ms, and what was on screen
jq -c 'select(.ev=="hitch" and .ms>100) | {t, ms, word}' logs/feed-*.ndjson

# everything within 400 ms after each move (where a flash between words would sit)
jq -s '[.[] | select(.ev=="move") | .t] as $moves
       | .[] | select(.t as $t | any($moves[]; $t >= . and $t <= .+400))
       | {t, ev, word, ms, shownMs, cause}' logs/feed-*.ndjson
```

`t` is per session; filter on `.session` when a file holds more than one.

## 5. What to report back

- How you ran it (device and browser, or headless settings), for how long, and the session id(s).
- For part A: anything missing, duplicated, out of order, or lost across lock/reload; file size.
- For part B: whether you saw a flash at all. For each one: its approximate time, and the
  log lines from 500 ms before to 500 ms after it (`move`, `hitch`, `word`/`leave`, `settle`).
- Counts: hitches over 100 ms, leaves under 300 ms, `touch-during-glide`, `advance-skipped`,
  and the largest `offBy`.
- Do **not** change feed code to "fix" what you find — the log's job here is evidence. Attach
  the `.ndjson` file (or its relevant slice) so the findings can be checked.

## 6. A prompt you can paste to another agent

> Read `docs/feed-log-test-handoff.md` in the KineMedia repo and carry out sections 3A and 3B.
> Start the dev server on port 5195, clear `logs/`, run the sessions described (a phone on the
> LAN if you have one; otherwise headless Chrome with the mobile settings in section 2), and
> report back in the format of section 5, with the relevant log lines attached. Do not modify
> any feed code.
