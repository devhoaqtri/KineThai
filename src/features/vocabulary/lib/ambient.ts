/**
 * Ambient background music player for the vocabulary feed.
 * Streams energetic tracks from free CDN sources (no self-hosting).
 * Two-tier source pool: DB tracks (primary) with hardcoded fallback.
 * Guarantees only one stream plays at a time, and that a track change always lands on
 * a DIFFERENT track from the one that was just playing.
 *
 * Pools are scoped: the Chinese (hoa.*) feed plays ONLY the traditional-instrument
 * pool below, and the default feed can never reach it — see AmbientScope.
 *
 * Exports: AmbientPlayer, AmbientScope, AMBIENT_SOURCES, FALLBACK_SOURCES, ZH_AMBIENT_SOURCES, WORDS_PER_TRACK, FADE_OUT_MS
 * Depends on: none (pure browser Audio API)
 */

type AudioSource = { url: string; name: string; bpm: number };

/**
 * Which pool family this browsing context may play from. `zh` is the Chinese deck
 * (hoa.* hosts): traditional Chinese instrumentals only. `default` is every other
 * host: the DB/fallback pool only. The two families are disjoint and neither tier
 * switch crosses between them, so a Chinese track can never surface under the main
 * feed and vice versa.
 */
export type AmbientScope = "default" | "zh";

/**
 * Hardcoded fallback sources — always available even when the DB is empty
 * or all primary streams fail. Energetic/upbeat tracks from free CDNs.
 */
export const FALLBACK_SOURCES: AudioSource[] = [
  {
    url: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Who%20Likes%20to%20Party.mp3",
    name: "Who Likes to Party",
    bpm: 128,
  },
  {
    url: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cool%20Rock.mp3",
    name: "Cool Rock",
    bpm: 120,
  },
  {
    url: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Electro%20Cabello.mp3",
    name: "Electro Cabello",
    bpm: 126,
  },
  {
    url: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Upbeat%20Forever.mp3",
    name: "Upbeat Forever",
    bpm: 130,
  },
  {
    url: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Funk%20Game%20Loop.mp3",
    name: "Funk Game Loop",
    bpm: 124,
  },
  {
    url: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/RetroFuture%20Clean.mp3",
    name: "RetroFuture Clean",
    bpm: 132,
  },
  {
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    name: "SoundHelix Groove 1",
    bpm: 120,
  },
  {
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
    name: "SoundHelix Groove 6",
    bpm: 118,
  },
];

/** Active source pool — starts as fallback, replaced by DB tracks when loaded. */
export const AMBIENT_SOURCES: AudioSource[] = [...FALLBACK_SOURCES];

/**
 * The Chinese feed's own pool: traditional Chinese instrumental music, hotlinked as
 * direct MP3s from Wikimedia Commons (which serves them with
 * `access-control-allow-origin: *`, so an <audio> element can stream them anywhere).
 * Every URL was HEAD-verified as 200 audio/mpeg before landing here. Licences are
 * CC0 / CC-BY / CC-BY-SA, so the artist rides in the displayed name as attribution.
 * Ogg/opus originals are played through Commons' stable `/transcoded/…mp3` derivatives.
 * This pool is zh-only: the default feed's tiers never include it, and this pool
 * never falls back to them.
 */
export const ZH_AMBIENT_SOURCES: AudioSource[] = [
  // Guofeng ensemble BGM — PeriTune, CC BY 3.0.
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c2/%E3%80%90%E7%84%A1%E6%96%99%E3%83%95%E3%83%AA%E3%83%BCBGM%E3%80%91%E4%B8%AD%E8%8F%AF%E9%A2%A8%E3%81%AE%E5%84%AA%E9%9B%85%E3%81%AABGM%E3%80%8CShenxian%E3%80%8D.opus/%E3%80%90%E7%84%A1%E6%96%99%E3%83%95%E3%83%AA%E3%83%BCBGM%E3%80%91%E4%B8%AD%E8%8F%AF%E9%A2%A8%E3%81%AE%E5%84%AA%E9%9B%85%E3%81%AABGM%E3%80%8CShenxian%E3%80%8D.opus.mp3",
    name: "Shenxian · PeriTune",
    bpm: 92,
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c3/%E3%80%90%E7%84%A1%E6%96%99%E3%83%95%E3%83%AA%E3%83%BCBGM%E3%80%91%E4%B8%AD%E8%8F%AF%E9%A2%A8%E3%81%AE%E7%A9%8F%E3%82%84%E3%81%8B%E3%81%AABGM%E3%80%8CTaohua%E3%80%8D.opus/%E3%80%90%E7%84%A1%E6%96%99%E3%83%95%E3%83%AA%E3%83%BCBGM%E3%80%91%E4%B8%AD%E8%8F%AF%E9%A2%A8%E3%81%AE%E7%A9%8F%E3%82%84%E3%81%8B%E3%81%AABGM%E3%80%8CTaohua%E3%80%8D.opus.mp3",
    name: "Taohua · PeriTune",
    bpm: 80,
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/7/76/%E3%80%90%E7%84%A1%E6%96%99%E3%83%95%E3%83%AA%E3%83%BCBGM%E3%80%91%E4%B8%AD%E8%8F%AF%E9%A2%A8%E3%81%AE%E5%8B%87%E5%A3%AE%E3%81%AA%E3%82%AA%E3%83%BC%E3%82%B1%E3%82%B9%E3%83%88%E3%83%A9%E6%9B%B2%E3%80%8CWuxia%E3%80%8D.ogg/%E3%80%90%E7%84%A1%E6%96%99%E3%83%95%E3%83%AA%E3%83%BCBGM%E3%80%91%E4%B8%AD%E8%8F%AF%E9%A2%A8%E3%81%AE%E5%8B%87%E5%A3%AE%E3%81%AA%E3%82%AA%E3%83%BC%E3%82%B1%E3%82%B9%E3%83%88%E3%83%A9%E6%9B%B2%E3%80%8CWuxia%E3%80%8D.ogg.mp3",
    name: "Wuxia · PeriTune",
    bpm: 120,
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/7/7c/%E3%80%90%E7%84%A1%E6%96%99%E3%83%95%E3%83%AA%E3%83%BCBGM%E3%80%91%E4%B8%AD%E8%8F%AF%E9%A2%A8%E3%81%AE%E5%8B%87%E5%A3%AE%E3%81%AA%E3%82%AA%E3%83%BC%E3%82%B1%E3%82%B9%E3%83%88%E3%83%A9%E6%9B%B2%E3%80%8CWuxia3%E3%80%8D.opus/%E3%80%90%E7%84%A1%E6%96%99%E3%83%95%E3%83%AA%E3%83%BCBGM%E3%80%91%E4%B8%AD%E8%8F%AF%E9%A2%A8%E3%81%AE%E5%8B%87%E5%A3%AE%E3%81%AA%E3%82%AA%E3%83%BC%E3%82%B1%E3%82%B9%E3%83%88%E3%83%A9%E6%9B%B2%E3%80%8CWuxia3%E3%80%8D.opus.mp3",
    name: "Wuxia III · PeriTune",
    bpm: 128,
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/8/87/%E3%80%90%E7%84%A1%E6%96%99%E3%83%95%E3%83%AA%E3%83%BCBGM%E3%80%91%E3%81%8B%E3%81%A3%E3%81%93%E3%81%84%E3%81%84%E3%82%AA%E3%83%AA%E3%82%A8%E3%83%B3%E3%82%BF%E3%83%AB%E6%9B%B2%E3%80%8CNumina%E3%80%8D.opus/%E3%80%90%E7%84%A1%E6%96%99%E3%83%95%E3%83%AA%E3%83%BCBGM%E3%80%91%E3%81%8B%E3%81%A3%E3%81%93%E3%81%84%E3%81%84%E3%82%AA%E3%83%AA%E3%82%A8%E3%83%B3%E3%82%BF%E3%83%AB%E6%9B%B2%E3%80%8CNumina%E3%80%8D.opus.mp3",
    name: "Numina · PeriTune",
    bpm: 110,
  },
  // Guqin, traditional repertoire — CharlieHuang, CC BY-SA 3.0 / CC BY 2.5.
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/6/60/Guqin-Yangguan_Sandie.ogg/Guqin-Yangguan_Sandie.ogg.mp3",
    name: "Yangguan Sandie · guqin",
    bpm: 60,
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/5/52/Guqin-Zuiyu_Changwan.ogg/Guqin-Zuiyu_Changwan.ogg.mp3",
    name: "Zuiyu Changwan · guqin",
    bpm: 56,
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/5/5a/Pingsha_Luoyan.ogg/Pingsha_Luoyan.ogg.mp3",
    name: "Pingsha Luoyan · guqin",
    bpm: 64,
  },
  // Guzheng and pipa — Antti Luode, CC BY 3.0. Native MP3s on Commons.
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/a/aa/Guzheng_Morning_%28Antti_Luode%29.mp3",
    name: "Guzheng Morning · Antti Luode",
    bpm: 112,
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/b/be/Senor_Guzheng_and_the_Happy_Monks_%28Antti_Luode%29.mp3",
    name: "Senor Guzheng · Antti Luode",
    bpm: 118,
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/9/99/My_name_is_Zheng_Zheng_GuZheng_%28Antti_Luode%29.mp3",
    name: "Zheng Zheng GuZheng · Antti Luode",
    bpm: 108,
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/d/dd/Pop_Pipa_%28Antti_Luode%29.mp3",
    name: "Pop Pipa · Antti Luode",
    bpm: 120,
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/f/fe/Sweet_Pipa_Of_Mine_%28Antti_Luode%29.mp3",
    name: "Sweet Pipa Of Mine · Antti Luode",
    bpm: 116,
  },
  // Mo Li Hua, the traditional folk melody — synthesizer demonstrations, CC0.
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c6/%E8%8C%89%E8%8E%89%E8%8A%B1-KS%E6%BC%94%E7%A4%BA.opus/%E8%8C%89%E8%8E%89%E8%8A%B1-KS%E6%BC%94%E7%A4%BA.opus.mp3",
    name: "Mo Li Hua (KS)",
    bpm: 100,
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/f/f0/%E8%8C%89%E8%8E%89%E8%8A%B1-FM%E6%BC%94%E7%A4%BA.opus/%E8%8C%89%E8%8E%89%E8%8A%B1-FM%E6%BC%94%E7%A4%BA.opus.mp3",
    name: "Mo Li Hua (FM)",
    bpm: 104,
  },
];

/** The feed rotates to a new track after this many words. */
export const WORDS_PER_TRACK = 5;

/** A track change eases the old track out, then the new one in — never a hard cut. */
export const FADE_OUT_MS = 1400;
/** A change that could not be prepared ahead of the word fades out faster, so the new track is not kept waiting. */
const QUICK_FADE_OUT_MS = 800;
const FADE_IN_MS = 1800;
const FADE_TICK_MS = 40;
/** Slack on top of the fade when a track is running out: `timeupdate` only fires a few times a second. */
const ENDING_SLACK_SECONDS = 0.35;

/**
 * Where the player is in a hand-over.
 * - `playing`: a track is audible.
 * - `leaving`: the current track is fading out.
 * - `held`: silent on purpose, waiting for the next word to begin before anything
 *   new starts. A track never starts in the middle of a word.
 */
type PlayerMode = "playing" | "leaving" | "held";

/** Where the music switch used to be remembered between visits; cleared on load. */
const LEGACY_STORAGE_KEY = "kinetic.vocab.ambient";
const AMBIENT_EVENT = "kinetic:vocab-ambient";

/**
 * Music is off on every visit until the reader turns it on, so the switch lives in memory
 * for this page only. It used to be saved in localStorage: one tap of the toggle meant the
 * music started by itself on every later visit, which is not a default anyone chose.
 */
let enabledThisVisit = false;

if (typeof window !== "undefined") {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // storage unavailable — nothing was saved there either
  }
}

/** Whether the reader turned music on during this visit. */
export function getAmbientEnabled(): boolean {
  return enabledThisVisit;
}

/** Turn music on or off for this visit, and tell every listener in the page. */
export function setAmbientEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  enabledThisVisit = enabled;
  window.dispatchEvent(new Event(AMBIENT_EVENT));
}

/** Event name dispatched when the ambient preference changes. */
export { AMBIENT_EVENT };

/** How many AmbientPlayer instances this module has constructed — powers the dev guard. */
let constructedCount = 0;

/**
 * True under Vite dev. Optional-chained so this module also imports cleanly under bare
 * Node (the regression scripts), where `import.meta.env` does not exist.
 */
function isDev(): boolean {
  return (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
}

/**
 * Singleton audio player that streams background music from a two-tier pool:
 * primary (DB tracks) and fallback (hardcoded AMBIENT_SOURCES).
 * - Only ONE Audio element ever exists; previous stream is always flushed first.
 * - On error, exhausts the current pool then falls back to the other tier.
 * - Smooth fade-in on play, fade-out/fade-in on a track change, instant stop on pause.
 * - Rotation is sequential and compares track URLs, so no change — whether asked for,
 *   caused by a track ending, or by a pool swap — can replay the track just heard.
 * - A new track only ever starts when the feed says a word is beginning. A track that
 *   is about to run out is faded before its last note and the player then waits,
 *   silent, for that word rather than starting something mid-word.
 */
export class AmbientPlayer {
  private audio: HTMLAudioElement | null = null;
  private sourceIndex = -1;
  /** The track a change has already committed to while the current one fades out.
   *  Held separately from `sourceIndex` so `currentSource` can name the UPCOMING song
   *  the instant a change is requested, instead of lingering on the fading one until the
   *  crossfade lands. Cleared once that track actually starts (or on stop/teardown). */
  private pendingIndex: number | null = null;
  private consecutiveErrors = 0;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  /** The pending "skip to next source after an error" timer, kept so teardown can cancel it. */
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  // Named listener references so `destroy()` can actually remove them — anonymous
  // arrows could never be unhooked, leaving an orphaned element self-perpetuating.
  private timeUpdateHandler: (() => void) | null = null;
  private endedHandler: (() => void) | null = null;
  private errorHandler: (() => void) | null = null;
  /** Set once `destroy()` has run, so a re-created element is fully rebuilt. */
  private stopped = true;

  constructor() {
    constructedCount += 1;
    if (isDev() && constructedCount > 1) {
      // The only way to a second instance is bypassing getAmbientPlayer(). Loud in dev
      // so a future refactor that reintroduces per-instance players (and thus overlap)
      // fails visibly instead of silently producing two streams.
      console.warn(
        "[ambient] a second AmbientPlayer instance was constructed — playback can overlap. Always use getAmbientPlayer().",
      );
    }
  }
  /** URL of the track most recently started; the one a change must move away from. */
  private lastUrl: string | null = null;
  private mode: PlayerMode = "playing";
  /** What happens once a fade-out finishes: start the next track, or wait for a word. */
  private afterLeave: "start" | "hold" = "start";
  /** Bumped every time a track starts, so callers can tell a change happened. */
  trackSerial = 0;
  /** Whether we are currently drawing from the fallback pool. */
  private usingFallback = false;
  /**
   * Which pool family this context plays from. Set once per browsing context from the
   * visited host's locale; a change mid-playback silences first, because a track from
   * the old family must never keep sounding under the new one.
   */
  private scope: AmbientScope = "default";

  /** The pool family this player is currently bound to. */
  get currentScope(): AmbientScope {
    return this.scope;
  }

  /**
   * Bind the player to a pool family. Idempotent: reconciles re-assert the scope on
   * every policy pass, so only a real change does anything. A real change while
   * audible stops first — the caller's reconcile then starts a track from the pool
   * this context actually belongs to.
   */
  setScope(next: AmbientScope): void {
    if (next === this.scope) return;
    this.scope = next;
    this.usingFallback = false;
    if (!this.stopped) this.stop();
  }

  /** Target volume (0–1). Background music stays subtle. */
  volume = 0.18;

  /** The pool currently being played from. The zh family is a single tier: it holds
   *  only traditional Chinese instrumentals and never borrows from the other side. */
  private get pool(): readonly AudioSource[] {
    if (this.scope === "zh") return ZH_AMBIENT_SOURCES;
    return this.usingFallback ? FALLBACK_SOURCES : AMBIENT_SOURCES;
  }

  /** Currently playing source name, or null if stopped. When a change is mid-fade,
   *  this already names the track that is about to start, so the UI can swap song
   *  titles at once instead of after the crossfade finishes. */
  get currentSource(): string | null {
    if (this.stopped || this.sourceIndex < 0) return null;
    const index = this.pendingIndex ?? this.sourceIndex;
    return this.pool[index]?.name ?? null;
  }

  /**
   * Start or resume playback. The first track of a session is picked at random, but
   * never the one that was playing when the music was last switched off.
   */
  play(): void {
    this.stopped = false;
    if (!this.audio) {
      this.audio = new Audio();
      // A track that runs out is anticipated: it is faded before its last note and the
      // player then waits for the next word. `ended` only gets here un-faded when the
      // length was unknown (a live stream) — and then, too, the next track waits.
      // Handlers are stored as fields so destroy() can remove them.
      this.timeUpdateHandler = () => this.fadeBeforeEnd();
      this.endedHandler = () => {
        if (this.stopped || this.mode !== "playing") return;
        this.clearFade();
        this.mode = "held";
      };
      this.errorHandler = () => {
        if (!this.stopped) this.onError();
      };
      this.audio.addEventListener("timeupdate", this.timeUpdateHandler);
      this.audio.addEventListener("ended", this.endedHandler);
      this.audio.addEventListener("error", this.errorHandler);
    }
    if (this.sourceIndex < 0) this.sourceIndex = this.randomFreshIndex();
    this.loadAndPlay();
  }

  /** True when the player is silent (or going silent) until the next word begins. */
  get awaitingWord(): boolean {
    return !this.stopped && (this.mode === "held" || this.afterLeave === "hold");
  }

  /** Whether the pool holds a track other than the one playing to move on to. */
  get canChange(): boolean {
    return !this.stopped && this.nextFreshIndex() >= 0;
  }

  /**
   * Move to another track. Call this when a word BEGINS, so the new track starts with
   * the word. If the old track has already been faded out and is waiting, the next
   * one starts at once; otherwise the old one is eased out first and the next follows.
   * @returns The `trackSerial` the new track will carry, or null when no change was
   *   started (nothing playing, or no other track to move to)
   */
  changeTrack(): number | null {
    if (this.stopped || !this.audio) return null;
    if (this.mode === "held") {
      this.startNext();
      return this.trackSerial;
    }
    if (this.mode === "leaving") {
      // Already fading towards a hold: let the fade finish, then start instead of wait.
      this.afterLeave = "start";
      return this.trackSerial + 1;
    }
    if (this.nextFreshIndex() < 0) return null;
    // Commit to the next track now, so `currentSource` names it immediately while the
    // old one eases out; `startNext` will consume this pending choice when the fade ends.
    this.pendingIndex = this.nextFreshIndex();
    this.leave("start", QUICK_FADE_OUT_MS);
    return this.trackSerial + 1;
  }

  /**
   * Ease the current track out and go silent until the next word. Call it shortly
   * before a word ends when its track's run is over, so the hand-over lands on the
   * word boundary instead of inside the next word.
   */
  fadeOutAndHold(): void {
    if (this.stopped || !this.audio || this.mode !== "playing") return;
    this.leave("hold", FADE_OUT_MS);
  }

  private leave(then: "start" | "hold", durationMs: number): void {
    this.mode = "leaving";
    this.afterLeave = then;
    this.fade(0, durationMs, () => {
      if (this.stopped) return;
      if (this.afterLeave === "start") {
        this.startNext();
        return;
      }
      this.audio?.pause();
      this.mode = "held";
    });
  }

  /** Fade a track that is about to run out, so it never ends on a hard stop. */
  private fadeBeforeEnd(): void {
    const audio = this.audio;
    if (!audio || this.stopped || this.mode !== "playing") return;
    const remaining = audio.duration - audio.currentTime;
    if (!Number.isFinite(remaining)) return;
    if (remaining > FADE_OUT_MS / 1000 + ENDING_SLACK_SECONDS) return;
    // Fade over what is actually left, in case the tab was throttled past the mark.
    this.leave("hold", Math.max(200, Math.min(FADE_OUT_MS, remaining * 1000 - 100)));
  }

  /** Start the next track in rotation; a pool of one has only itself to play again. */
  private startNext(): void {
    const pool = this.pool;
    if (pool.length === 0) {
      this.switchPool();
      return;
    }
    // A change committed to a track before the fade started; honour that exact choice
    // rather than advancing again (which would silently skip one track).
    const pending = this.pendingIndex;
    this.pendingIndex = null;
    const fresh = pending ?? this.nextFreshIndex();
    this.sourceIndex = fresh >= 0 ? fresh : (this.sourceIndex + 1) % pool.length;
    this.consecutiveErrors = 0;
    this.loadAndPlay();
  }

  /** Stop playback completely. Guarantees silence — no stream left running. */
  stop(): void {
    this.stopped = true;
    this.mode = "playing";
    this.afterLeave = "start";
    this.clearFade();
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load(); // flush pipeline, guarantees no buffered audio plays
    }
    this.pendingIndex = null;
    this.sourceIndex = -1;
    this.consecutiveErrors = 0;
  }

  /**
   * Fully release the media element: pause, unload, detach every listener, and cancel
   * the fade and retry timers. After this the instance holds no `Audio`, so NOTHING it
   * once scheduled can keep emitting sound — the guarantee a hot-reload or teardown
   * needs so an orphaned element can never play alongside the next module instance.
   */
  private destroy(): void {
    this.stopped = true;
    this.mode = "playing";
    this.afterLeave = "start";
    this.clearFade();
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const audio = this.audio;
    if (audio) {
      audio.pause();
      if (this.timeUpdateHandler) audio.removeEventListener("timeupdate", this.timeUpdateHandler);
      if (this.endedHandler) audio.removeEventListener("ended", this.endedHandler);
      if (this.errorHandler) audio.removeEventListener("error", this.errorHandler);
      audio.removeAttribute("src");
      audio.load();
    }
    this.audio = null;
    this.timeUpdateHandler = null;
    this.endedHandler = null;
    this.errorHandler = null;
    this.pendingIndex = null;
    this.sourceIndex = -1;
    this.consecutiveErrors = 0;
    this.lastUrl = null;
  }

  /**
   * Called on hot-reload teardown (Vite `dispose`): release the element and mark this
   * instance permanently stopped so no in-flight timer can resurrect playback. The next
   * module instance builds a fresh player via the global registry.
   */
  forceReleaseForReload(): void {
    this.destroy();
  }

  /**
   * Cut straight to the next source in the current pool. Used when a source FAILS —
   * there is nothing to fade and nothing was heard, so there is no reason to wait.
   * Skips the track just tried; only a pool of one can repeat.
   */
  next(): void {
    this.startNext();
  }

  /**
   * The next index in rotation order whose track is not the one just heard, or -1
   * when the pool has no such track. Walks forward from the current position rather
   * than drawing at random: a random draw can land on the same track again, and the
   * whole point of a change is that the listener hears something else.
   */
  private nextFreshIndex(): number {
    const pool = this.pool;
    for (let step = 1; step <= pool.length; step += 1) {
      const index = (Math.max(this.sourceIndex, -1) + step) % pool.length;
      if (pool[index]!.url !== this.lastUrl) return index;
    }
    return -1;
  }

  /** A random starting index that avoids the track just heard whenever it can. */
  private randomFreshIndex(): number {
    const pool = this.pool;
    const fresh = pool
      .map((_, index) => index)
      .filter((index) => pool[index]!.url !== this.lastUrl);
    const candidates = fresh.length ? fresh : pool.map((_, index) => index);
    return candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
  }

  /** Replace the primary source pool (used when DB tracks are loaded). The zh pool is
   *  authored, not administered, so DB tracks never reach a Chinese feed. */
  setSources(sources: AudioSource[]): void {
    if (this.scope === "zh") return;
    AMBIENT_SOURCES.length = 0;
    AMBIENT_SOURCES.push(...sources);
    // If we were using the primary pool, reset index if out of bounds.
    if (!this.usingFallback && this.sourceIndex >= AMBIENT_SOURCES.length) {
      this.sourceIndex = 0;
    }
  }

  private loadAndPlay(): void {
    if (!this.audio || this.stopped) return;
    const source = this.pool[this.sourceIndex];
    if (!source) return;
    // CRITICAL: flush any previous stream before starting a new one.
    // This guarantees never two streams play simultaneously.
    this.clearFade();
    this.mode = "playing";
    this.afterLeave = "start";
    this.audio.pause();
    this.audio.volume = 0;
    this.audio.src = source.url;
    this.lastUrl = source.url;
    this.trackSerial += 1;
    const playPromise = this.audio.play();
    if (playPromise) {
      playPromise
        .then(() => {
          if (!this.stopped) this.fade(this.volume, FADE_IN_MS);
        })
        .catch(() => {
          // Autoplay blocked or source failed to decode.
          // Silently fail; the error event handler will trigger fallback.
        });
    }
  }

  /**
   * Ease the volume from wherever it is to `target`. Timed against the clock, not a
   * step count, so a throttled background tab still finishes on schedule, and shaped
   * with a smoothstep curve so neither end of the fade starts or stops abruptly.
   */
  private fade(target: number, durationMs: number, onDone?: () => void): void {
    if (!this.audio) return;
    this.clearFade();
    const from = this.audio.volume;
    const startedAt = Date.now();
    this.fadeTimer = setInterval(() => {
      if (!this.audio || this.stopped) {
        this.clearFade();
        return;
      }
      const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
      const eased = progress * progress * (3 - 2 * progress);
      this.audio.volume = Math.min(1, Math.max(0, from + (target - from) * eased));
      if (progress < 1) return;
      this.clearFade();
      onDone?.();
    }, FADE_TICK_MS);
  }

  private clearFade(): void {
    if (this.fadeTimer !== null) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private onError(): void {
    this.consecutiveErrors += 1;
    const pool = this.pool;
    // Exhausted current pool — switch to the other tier.
    if (this.consecutiveErrors >= pool.length) {
      this.switchPool();
      return;
    }
    // Skip to next source after a short delay. The timer is stored so destroy()/stop()
    // can cancel it, and the callback re-checks `stopped` before doing anything.
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.next();
    }, 300);
  }

  /** Switch between primary and fallback pools. The zh family has no second tier to
   *  fall back to — a Chinese feed that exhausts its own pool goes silent rather than
   *  borrowing the main feed's music. */
  private switchPool(): void {
    if (this.scope === "zh") {
      this.stop();
      return;
    }
    this.usingFallback = !this.usingFallback;
    this.consecutiveErrors = 0;
    const pool = this.pool;
    if (pool.length === 0) {
      // Both pools empty — give up.
      this.stop();
      return;
    }
    this.sourceIndex = this.randomFreshIndex();
    this.loadAndPlay();
  }
}

/**
 * Shared singleton. Held on a global slot rather than only a module-scoped `let`, so a
 * hot-reload that re-evaluates this module returns the SAME player instead of building
 * a second `Audio` next to the one still playing. The old module-scoped variable was
 * per-instance and got reset on re-import, which is how two streams could overlap.
 */
const GLOBAL_PLAYER_KEY = "__kineticAmbientPlayer";

/** Get or create the single shared ambient player for this browsing context. */
export function getAmbientPlayer(): AmbientPlayer {
  const registry = globalThis as unknown as Record<string, AmbientPlayer | undefined>;
  if (!registry[GLOBAL_PLAYER_KEY]) registry[GLOBAL_PLAYER_KEY] = new AmbientPlayer();
  return registry[GLOBAL_PLAYER_KEY]!;
}

// On hot reload, release the outgoing instance's media element BEFORE the new module
// evaluates, so no orphaned `Audio` survives into the reloaded app alongside the fresh
// one. Guarded so it is a no-op under production builds and bare Node.
const hot = (import.meta as { hot?: { dispose(cb: () => void): void } }).hot;
if (hot) {
  hot.dispose(() => {
    const registry = globalThis as unknown as Record<string, AmbientPlayer | undefined>;
    registry[GLOBAL_PLAYER_KEY]?.forceReleaseForReload();
    delete registry[GLOBAL_PLAYER_KEY];
  });
}

// ---------------------------------------------------------------------------
// Remote track fetching (Supabase-backed via admin server function)
// ---------------------------------------------------------------------------

let remoteTracks: Array<{ url: string; name: string; bpm: number }> | null = null;
let fetchInFlight: Promise<void> | null = null;

/**
 * Fetch tracks from the database. On success, replaces the player's source
 * pool with DB tracks (falling back to AMBIENT_SOURCES when empty).
 * Safe to call multiple times — only one request is in-flight at a time.
 */
export async function refreshRemoteTracks(): Promise<void> {
  if (remoteTracks) return; // already loaded
  if (fetchInFlight) return fetchInFlight;
  // DB tracks are the main feed's primary tier; the Chinese feed plays its authored
  // pool only, so it never even asks.
  if (getAmbientPlayer().currentScope === "zh") return;
  fetchInFlight = (async () => {
    try {
      const { listAmbientTracks } = await import("@/features/admin/api/ambient.functions");
      const tracks = await listAmbientTracks();
      if (tracks.length > 0) {
        remoteTracks = tracks.map((t) => ({ url: t.url, name: t.name, bpm: t.bpm }));
        getAmbientPlayer().setSources(remoteTracks);
      }
    } catch {
      // DB unavailable — silently use hardcoded fallback
    } finally {
      fetchInFlight = null;
    }
  })();
  return fetchInFlight;
}
