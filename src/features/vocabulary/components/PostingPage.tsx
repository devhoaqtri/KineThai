/**
 * /posting: the post calendar, managed. Every post from a week back to three weeks ahead,
 * by day: its clip to watch, its caption to edit, and where it stands on each platform —
 * TikTok (drafted in the emulator, marked posted with its link here) and Facebook and
 * Instagram (published through Meta's API, now or by the scheduled job at the post's time).
 *
 * The page only reads and asks: posting.server.ts owns the calendar file and starts the
 * same publish command the scheduled job runs, so a post looks the same whichever started
 * it. While anything is publishing the page refreshes itself every few seconds.
 *
 * A Facebook Reel or a YouTube Short can carry a song from that platform's own library (Meta's
 * Sound Collection, YouTube's Audio Library, laid in by scripts/lib/music-mix.ts): pick one,
 * play the clip with it, and Accept. A proposed song
 * holds the post until it is accepted; accepting after the post's time publishes it at once.
 *
 * Development only (routes/posting.tsx); the build fails if this reaches a bundle.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import "../vocabulary-export.css";

type Platform = "facebook" | "instagram" | "youtube";
type MusicPlatform = "facebook" | "youtube";
const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "facebook", label: "Facebook" },
  { id: "youtube", label: "YouTube" },
  { id: "instagram", label: "Instagram" },
];

type Track = {
  status: "pending" | "publishing" | "posted" | "failed" | "skipped";
  caption?: string | null;
  url?: string | null;
  at?: string | null;
  error?: string | null;
  attempts?: number;
  privacy?: string | null;
  music?: { song: string | null; startSec: number; status: "proposed" | "accepted" } | null;
};

type Post = {
  day: number;
  date: string;
  time: string;
  word: string;
  code: string;
  level: string;
  status: string;
  url: string | null;
  caption: string;
  hasClip: boolean;
  mixes: Record<MusicPlatform, boolean>;
  durationSec: number | null;
  platforms: Partial<Record<Platform, Track>>;
};

type Listing = {
  today: string;
  connection: Record<Platform, string | null>;
  libraries: Record<MusicPlatform, { dir: string; songs: string[] }>;
  posts: Post[];
};

const songTitle = (file: string) => file.replace(/\.[^.]+$/, "");

const API = "/api/dev/posting";

async function act(body: object): Promise<string | null> {
  const response = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.ok) return null;
  const json = (await response.json().catch(() => ({}))) as { error?: string };
  return json.error ?? `HTTP ${response.status}`;
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayLabel = (date: string, today: string) =>
  date === today ? `Today · ${WEEKDAY.format(new Date(`${date}T00:00:00Z`))}` : WEEKDAY.format(new Date(`${date}T00:00:00Z`));

/** One platform's line on a post: its state, its link, and what can be done now. */
function PlatformRow({
  post,
  platform,
  label,
  blocked,
  onDone,
}: {
  post: Post;
  platform: Platform;
  label: string;
  blocked: string | null;
  onDone: (error: string | null) => void;
}) {
  const track: Track = post.platforms[platform] ?? { status: "pending" };
  const [busy, setBusy] = useState(false);
  const run = async (body: object) => {
    setBusy(true);
    onDone(await act(body));
    setBusy(false);
  };
  const live = track.status === "posted";
  return (
    <div className="posting-track" data-status={track.status}>
      <span className="posting-track-name">{label}</span>
      <span className="posting-chip" data-status={track.status}>
        {track.status === "failed" && track.attempts ? `failed ×${track.attempts}` : track.status}
      </span>
      {live && track.privacy && track.privacy !== "public" && (
        <span className="posting-chip" data-status="failed" title="An unaudited YouTube API project's uploads stay private">
          {track.privacy}
        </span>
      )}
      {live && track.url && (
        <a className="posting-link" href={track.url} target="_blank" rel="noreferrer">
          open
        </a>
      )}
      <span className="posting-track-actions">
        {!live && track.status !== "publishing" && (
          <button
            type="button"
            disabled={busy || !post.hasClip || !!blocked || track.status === "skipped" || track.music?.status === "proposed"}
            title={
              blocked ??
              (!post.hasClip
                ? "No clip yet"
                : track.music?.status === "proposed"
                  ? "Accept the song first"
                  : "Publish this post now")
            }
            onClick={() => run({ action: "publish", day: post.day, platform })}
          >
            {track.status === "failed" ? "Retry" : "Publish now"}
          </button>
        )}
        {!live && track.status !== "publishing" && (
          <button
            type="button"
            className="posting-quiet"
            disabled={busy}
            onClick={() => run({ action: "skip", day: post.day, platform, skip: track.status !== "skipped" })}
          >
            {track.status === "skipped" ? "Unskip" : "Skip"}
          </button>
        )}
      </span>
      {track.error && track.status === "failed" && <p className="posting-error">{track.error}</p>}
    </div>
  );
}

const MUSIC: { id: MusicPlatform; label: string; library: string }[] = [
  { id: "facebook", label: "Facebook", library: "Meta's Sound Collection" },
  { id: "youtube", label: "YouTube", library: "YouTube Studio's Audio Library" },
];

/**
 * The song under one platform's video: which track and from where, mixed on Mix, then
 * Accept. Read-only once the post is live there.
 */
function SongRow({
  post,
  platform,
  onDone,
}: {
  post: Post;
  platform: { id: MusicPlatform; label: string; library: string; dir: string; songs: string[] };
  onDone: (error: string | null) => void;
}) {
  const { songs, dir: soundsDir } = platform;
  const track: Track = post.platforms[platform.id] ?? { status: "pending" };
  const music = track.music ?? null;
  const current = music ? (music.song ?? "none") : "";
  const [choice, setChoice] = useState(current);
  const [start, setStart] = useState(String(music?.startSec ?? 0));
  const [busy, setBusy] = useState<"mix" | "accept" | null>(null);
  useEffect(() => setChoice(current), [current]);
  useEffect(() => setStart(String(music?.startSec ?? 0)), [music?.startSec]);
  const locked = track.status === "posted" || track.status === "publishing";
  if (locked && !music) return null;
  if (!songs.length && !music) {
    return (
      <p className="posting-song-empty">
        ♪ {platform.label}: no songs yet. Download tracks from {platform.library} into <code>{soundsDir}</code> and
        {platform.label} posts get one to accept.
      </p>
    );
  }
  const changed = choice !== current || (choice !== "none" && Number(start) !== (music?.startSec ?? 0));
  const run = async (kind: "mix" | "accept", body: object) => {
    setBusy(kind);
    onDone(await act(body));
    setBusy(null);
  };
  return (
    <div className="posting-song" data-status={music?.status ?? "none"}>
      <span className="posting-track-name">♪ {platform.label}</span>
      {locked ? (
        <span>{music?.song ? `${songTitle(music.song)} · from ${music.startSec}s` : "no music"}</span>
      ) : (
        <>
          <select value={choice} onChange={(event) => setChoice(event.target.value)} aria-label={`Song for ${platform.label}`}>
            {!music && <option value="">Choose a song…</option>}
            {songs.map((song) => (
              <option key={song} value={song}>
                {songTitle(song)}
              </option>
            ))}
            <option value="none">No music</option>
          </select>
          {choice !== "none" && choice !== "" && (
            <label className="posting-song-start">
              from
              <input
                type="number"
                min={0}
                step={1}
                value={start}
                onChange={(event) => setStart(event.target.value)}
                aria-label="Start the song this many seconds in"
              />
              s
            </label>
          )}
          <span className="posting-track-actions">
            {(changed || !music) && (
              <button
                type="button"
                disabled={!!busy || choice === "" || !post.hasClip || !(Number(start) >= 0)}
                onClick={() =>
                  run("mix", {
                    action: "song",
                    day: post.day,
                    platform: platform.id,
                    song: choice === "none" ? null : choice,
                    startSec: Number(start) || 0,
                  })
                }
              >
                {busy === "mix" ? "Mixing…" : choice === "none" ? "Set" : "Mix"}
              </button>
            )}
            {music?.status === "proposed" && !changed && (
              <button type="button" disabled={!!busy} onClick={() => run("accept", { action: "song-accept", day: post.day, platform: platform.id })}
              >
                Accept
              </button>
            )}
          </span>
        </>
      )}
      {music && (
        <span className="posting-chip" data-status={music.status === "accepted" ? "posted" : "pending"}>
          {music.status === "accepted" ? "accepted" : "waiting for you"}
        </span>
      )}
    </div>
  );
}

/** The TikTok line: drafted by the job, posted by hand in the emulator, its link noted here. */
function TikTokRow({ post, onDone }: { post: Post; onDone: (error: string | null) => void }) {
  const [link, setLink] = useState("");
  const posted = post.status === "posted";
  return (
    <div className="posting-track" data-status={posted ? "posted" : post.status}>
      <span className="posting-track-name">TikTok</span>
      <span className="posting-chip" data-status={posted ? "posted" : post.status === "drafted" ? "pending" : post.status}>
        {post.status}
      </span>
      {posted && post.url && (
        <a className="posting-link" href={post.url} target="_blank" rel="noreferrer">
          open
        </a>
      )}
      {!posted && post.status === "drafted" && (
        <form
          className="posting-track-actions"
          onSubmit={async (event) => {
            event.preventDefault();
            onDone(await act({ action: "tiktok-posted", day: post.day, url: link.trim() }));
          }}
        >
          <input
            type="url"
            placeholder="Paste the TikTok link once posted"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            required
          />
          <button type="submit">Mark posted</button>
        </form>
      )}
    </div>
  );
}

/** A post: clip, word, caption (shared, or per platform) and its three tracks. */
function PostCard({
  post,
  listing,
  onChanged,
}: {
  post: Post;
  listing: Listing;
  onChanged: (error: string | null) => void;
}) {
  const { connection } = listing;
  const [captionFor, setCaptionFor] = useState<"all" | Platform>("all");
  // The platforms whose mix can be played: a song set and its file on disk.
  const mixed = MUSIC.filter((m) => post.platforms[m.id]?.music?.song && post.mixes[m.id]);
  const [hear, setHear] = useState<MusicPlatform | "clip" | null>(null);
  const playing = hear === "clip" ? null : (mixed.find((m) => m.id === hear) ?? mixed[0] ?? null);
  // The song and its start, so a remix reloads the player.
  const playingMusic = playing ? post.platforms[playing.id]?.music : null;
  const musicAt = playingMusic ? `${playingMusic.song}:${playingMusic.startSec}` : "";
  const shown = captionFor === "all" ? post.caption : post.platforms[captionFor]?.caption || post.caption;
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const dirty = draft !== shown;
  return (
    <article className="posting-card">
      <div className="posting-clip">
        {post.hasClip ? (
          <>
            <video
              key={playing ? `${playing.id}:${musicAt}` : "clip"}
              src={`${API}?clip=${post.day}${playing ? `&mix=${playing.id}&v=${encodeURIComponent(musicAt)}` : ""}`}
              controls
              preload="metadata"
              playsInline
            />
            {mixed.length > 0 && (
              <div className="posting-clip-tabs" role="tablist" aria-label="Play">
                {mixed.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={playing?.id === m.id}
                    onClick={() => setHear(m.id)}
                  >
                    {mixed.length > 1 ? `${m.label} song` : "With song"}
                  </button>
                ))}
                <button type="button" role="tab" aria-selected={!playing} onClick={() => setHear("clip")}>
                  As rendered
                </button>
              </div>
            )}
          </>
        ) : (
          <span className="posting-noclip">No clip yet{post.status === "planned" ? " — the 03:00 job renders it" : ""}</span>
        )}
      </div>
      <div className="posting-body">
        <header className="posting-head">
          <span className="posting-time">{post.time}</span>
          <strong>{post.word}</strong>
          <span className="posting-meta">
            #{post.day} · {post.level} · {post.code}
            {post.durationSec ? ` · ${post.durationSec}s` : ""}
          </span>
        </header>
        <div className="posting-caption">
          <div className="posting-caption-tabs" role="tablist" aria-label="Caption for">
            {(["all", "facebook", "instagram", "youtube"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={captionFor === tab}
                onClick={() => setCaptionFor(tab)}
              >
                {tab === "all" ? "Caption" : `${PLATFORMS.find((p) => p.id === tab)!.label} only`}
                {tab !== "all" && post.platforms[tab]?.caption ? " •" : ""}
              </button>
            ))}
          </div>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={5} />
          {dirty && (
            <div className="posting-caption-actions">
              <button
                type="button"
                onClick={async () =>
                  onChanged(
                    await act({
                      action: "caption",
                      day: post.day,
                      ...(captionFor === "all" ? {} : { platform: captionFor }),
                      caption: draft,
                    }),
                  )
                }
              >
                Save caption
              </button>
              <button type="button" className="posting-quiet" onClick={() => setDraft(shown)}>
                Discard
              </button>
            </div>
          )}
        </div>
        <TikTokRow post={post} onDone={onChanged} />
        {PLATFORMS.map((p) => (
          <PlatformRow key={p.id} post={post} platform={p.id} label={p.label} blocked={connection[p.id]} onDone={onChanged} />
        ))}
        {/* A song is chosen ahead of the post on a connected platform; past and unrendered
            posts only show one they carry. */}
        {MUSIC.map(
          (m) =>
            (post.platforms[m.id]?.music ||
              (post.hasClip &&
                post.date >= listing.today &&
                !connection[m.id] &&
                post.platforms[m.id]?.status !== "skipped")) && (
              <SongRow key={m.id} post={post} platform={{ ...m, ...listing.libraries[m.id] }} onDone={onChanged} />
            ),
        )}
      </div>
    </article>
  );
}

export function PostingPage() {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(API);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setListing((await response.json()) as Listing);
    } catch (cause) {
      setError(`Could not load the calendar: ${(cause as Error).message}`);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const publishing = listing?.posts.some((p) => Object.values(p.platforms).some((t) => t?.status === "publishing"));
  // Refresh while something is in flight, and once a minute otherwise (the job runs too).
  useEffect(() => {
    const id = window.setInterval(() => void load(), publishing ? 4000 : 60_000);
    return () => window.clearInterval(id);
  }, [load, publishing]);

  const byDate = useMemo(() => {
    const groups = new Map<string, Post[]>();
    for (const post of listing?.posts ?? []) groups.set(post.date, [...(groups.get(post.date) ?? []), post]);
    return [...groups];
  }, [listing]);

  const onChanged = useCallback(
    (problem: string | null) => {
      setError(problem);
      void load();
    },
    [load],
  );

  return (
    <main className="posting">
      <header className="posting-top">
        <h1>Posting</h1>
        {listing && (
          <ul className="posting-connections">
            <li data-ok="true">TikTok · drafts in the emulator</li>
            {PLATFORMS.map((p) => (
              <li key={p.id} data-ok={!listing.connection[p.id]} title={listing.connection[p.id] ?? "Connected"}>
                {p.label} · {listing.connection[p.id] ? "not connected" : "connected"}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="posting-quiet" onClick={() => void load()}>
          Refresh
        </button>
      </header>
      {listing && Object.values(listing.connection).some(Boolean) && (
        <p className="posting-note">
          Facebook, Instagram and YouTube post themselves at each post's time once connected:{" "}
          <code>npm run tiktok -- meta-setup</code> (docs/meta-publishing.md) and{" "}
          <code>npm run tiktok -- youtube-setup</code> (docs/youtube-publishing.md).
        </p>
      )}
      {error && (
        <p className="posting-error" role="alert">
          {error}
        </p>
      )}
      {!listing && !error && <p className="posting-note">Loading…</p>}
      {byDate.map(([date, posts]) => (
        <section key={date} className="posting-day" data-past={listing && date < listing.today ? "" : undefined}>
          <h2>{listing && dayLabel(date, listing.today)}</h2>
          {posts.map((post) => (
            <PostCard key={post.day} post={post} listing={listing!} onChanged={onChanged} />
          ))}
        </section>
      ))}
    </main>
  );
}
