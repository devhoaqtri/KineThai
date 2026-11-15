/**
 * One word, rendered as a finished promo clip and nothing else.
 *
 * The whole sequence — opening badge, the word in the app's own chrome, end card — as a
 * state machine in one component, instead of a recorder reaching into the live feed and
 * operating it from outside.
 *
 * That outside approach is what this replaces, and it is worth saying why it failed, since
 * it looked like it worked for a while. To hold the first clue back, the recorder clicked
 * the feed's pause button — and lost the race: the entrance had already played within a
 * second of the card mounting, so the clip opened on finished text. To get a fresh
 * entrance it then synthesised taps on the card's own tap zones to navigate forward and
 * back, which turned out to move TWO pages per touch (the card answers both pointerup and
 * touchend), so the page indicator visibly flicked to a later clue and back. Here the same
 * thing is a prop: the card is handed `active={false}` until the badge has gone, so its
 * first page has not started rather than being rewound.
 *
 * The CONTRACT is the point of the file — see SHOWCASE_CONTRACT. Treat it as published:
 * changing a phase name breaks whatever is recording, and scripts/check-showcase.ts is
 * what says so.
 *
 * Exports: ShowcasePage
 * Depends on: VocabularyCard, showcase-contract, useServedWord, vocabulary.css
 */

import { useContext, useEffect, useMemo, useState } from "react";
import { useLoaderData, useSearch } from "@tanstack/react-router";
import { VocabularyCard } from "./VocabularyCard";
import { ShowcaseChrome } from "./ShowcaseChrome";
import { DemoBadge } from "./DemoBadge";
import { EmojiBurst } from "./EmojiBurst";
import { DEMO_BADGE_VARIANT, type BadgeVariant } from "../lib/badge-variants";
import { EMOJI_PALETTE, mockEmojiTotals, type EmojiTotals } from "../lib/emoji";
import { DeckLocaleContext } from "../lib/deck-locale";
import { siteAddress } from "../lib/target-language";
import { WORD_HOOK } from "../lib/first-visit";
import {
  SHOWCASE_CONTRACT,
  pickShowcaseVariants,
  type ShowcaseIntroVariant,
  type ShowcaseOutroVariant,
  type ShowcasePhase,
} from "../lib/showcase-contract";
import { useServedWord, type WordLookup } from "../hooks/useServedWord";
// Each page component brings the card's stylesheet in; this is a page like any other.
import "../vocabulary.css";
import "../vocabulary-export.css";
import type { FeedEntry, Presentation } from "../types";

/** The 4:5 frame's clue margins inside its band (its chrome is already outside it). */
const FRAME_4X5_CLUE_INSETS = { top: 8, bottom: 8 } as const;

/** How long to wait for a paint before declaring readiness anyway. */
const READY_BACKSTOP_MS = 400;

function setPhase(phase: ShowcasePhase) {
  if (typeof document !== "undefined") document.body.dataset.showcasePhase = phase;
}

/**
 * The scene durations, read from the stylesheet that animates them.
 *
 * The timeline lives in CSS; this only needs to know when each scene is over. Reading it
 * back means there is ONE number per scene rather than one in the stylesheet and a copy
 * here that silently disagrees after a re-time.
 *
 * The unit has to be read as well as the number: Chrome serialises a custom property's
 * time canonically in SECONDS, so `4600ms` in the stylesheet comes back as "4.6s" and a
 * bare parseFloat turns four and a half seconds into four and a half milliseconds.
 * @param name - the custom property to read off the document element
 * @param fallback - used when the stylesheet has not loaded or the value is unreadable
 * @returns milliseconds
 */
function cssDuration(name: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return /ms$/.test(raw) ? value : value * 1000;
}

/** One word, played from first frame to end card, ready to be recorded. */
export function ShowcasePage() {
  const search = useSearch({ from: "/showcase" });
  const { locale } = useLoaderData({ from: "/showcase" });
  const [phase, setLocalPhase] = useState<ShowcasePhase>("loading");

  // Resolved once. A re-render must not land on a different word mid-take, and `seed`
  // exists so a scheduled job can ask for the same clip twice.
  const lookup = useMemo<WordLookup>(
    () =>
      search.code
        ? { code: search.code }
        : { seed: search.seed ?? Math.floor(Math.random() * 1_000_000) },
    [search.code, search.seed],
  );
  // undefined while the lookup is in flight; the phase stays "loading" until it lands.
  const { word } = useServedWord(lookup);
  // Also resolved once, for the same reason: the end card must not change look mid-take.
  const variants = useMemo(
    () => pickShowcaseVariants(search.seed, search.intro, search.outro),
    [search.seed, search.intro, search.outro],
  );

  const look = (search.look ?? DEMO_BADGE_VARIANT) as BadgeVariant;

  const go = (next: ShowcasePhase) => {
    setLocalPhase(next);
    setPhase(next);
  };

  // ── loading → ready ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (word === undefined) return;
    if (!word) {
      setPhase("missing");
      setLocalPhase("missing");
      return;
    }
    document.body.dataset.showcaseWord = word.word;
    document.body.dataset.showcaseIntro = variants.intro;
    document.body.dataset.showcaseOutro = variants.outro;
    // Two frames: one for the card to mount, one for it to have painted. The timeout is
    // not belt and braces — a headless tab may have rAF throttled to nothing, and a
    // readiness signal that only ever arrives on a frame would wait forever.
    let settled = false;
    const announce = () => {
      if (settled) return;
      settled = true;
      go("ready");
    };
    const frame = requestAnimationFrame(() => requestAnimationFrame(announce));
    const backstop = setTimeout(announce, READY_BACKSTOP_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(backstop);
    };
    // Runs once per word: later phase changes must not re-announce readiness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);

  // ── the driver's way in ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const start = () => setLocalPhase((current) => (current === "ready" ? "intro" : current));
    window.addEventListener(SHOWCASE_CONTRACT.startEvent, start);
    // autostart has to WAIT for readiness rather than fire on mount: readiness is announced
    // a frame or two later, and a start that arrives first is dropped by the guard above and
    // the page sits on "ready" forever. Depending on `phase` makes it fire once, when the
    // page is actually ready to be recorded.
    if (search.autostart === true && phase === "ready") start();
    return () => window.removeEventListener(SHOWCASE_CONTRACT.startEvent, start);
  }, [search.autostart, phase]);

  // ── intro → playing ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "intro") return;
    setPhase("intro");
    const timer = setTimeout(() => go("playing"), cssDuration("--intro-dur", 1980));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── outro → done ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "outro") return;
    setPhase("outro");
    const timer = setTimeout(() => go("done"), cssDuration("--outro-dur", 4600));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const entry = useMemo<FeedEntry | null>(
    () => (word ? { occurrenceId: `showcase-${word.id}`, position: 1, cycle: 0, word } : null),
    [word],
  );
  const presentation = useMemo<Presentation>(
    () => ({
      theme: search.theme ?? "mix",
      style: (search.style ?? "mix") as Presentation["style"],
      autoplay: true,
      advance: true,
      pace: "normal",
      dialect: search.dialect ?? "default",
    }),
    [search.theme, search.style, search.dialect],
  );

  if (word === undefined) return <main className="vocab-showcase" aria-busy="true" />;
  if (!entry || !word) {
    return (
      <main className="vocab-showcase" data-missing="">
        <p>No word to show{search.code ? ` for the code “${search.code}”` : ""}.</p>
      </main>
    );
  }

  return (
    <DeckLocaleContext.Provider value={locale}>
      <main className="vocab-showcase vocab-recording">
        <div
          {...{ [SHOWCASE_CONTRACT.stageAttribute]: "" }}
          className="vocab-showcase-stage"
          data-frame={search.frame ?? "9x16"}
        >
          {/* The chrome a reader taps is drawn here as scenery instead: a clip cannot be
              tapped, and reusing the live toolbar would drag its dropdowns, sheets and
              focus handling into a surface that has no one to serve them. */}
          <ShowcaseChrome hidden={phase === "loading" || phase === "ready" || phase === "intro"} />
          <VocabularyCard
            entry={entry}
            presentation={presentation}
            // The whole point: held at the first frame of its first page until the badge has
            // gone. `current` stays true throughout so the card reads this as paused and
            // holds everything, rather than as the reader having moved on.
            active={phase === "playing"}
            current
            reducedMotion={false}
            matching={0}
            canAdvance
            onAdvance={() => setLocalPhase("outro")}
            // The 4:5 frame's clue band already ends short of the title row and the progress,
            // so its clues may fill it rather than keep the feed's chrome margins.
            clueInsets={search.frame === "4x5" ? FRAME_4X5_CLUE_INSETS : undefined}
          />
          {phase === "intro" && search.frame !== "4x5" && (
            <ShowcaseIntro text={search.badge ?? WORD_HOOK} variant={variants.intro} />
          )}
          {/* The 4:5 frame opens on the feed badge's own scene (veil, backdrop, aura, ring)
              in the chosen look, its card replaced by the question below, which pops in
              there, then docks in the top-left corner and stays for the whole word. */}
          {phase === "intro" && search.frame === "4x5" && (
            <DemoBadge
              text={search.badge ?? WORD_HOOK}
              durationMs={cssDuration("--intro-dur", 1980)}
              variant={look}
              contained
            />
          )}
          {search.frame === "4x5" && phase !== "loading" && phase !== "ready" && (
            <ShowcaseHook text={search.badge ?? WORD_HOOK} look={look} />
          )}
          {(phase === "outro" || phase === "done") && (
            <ShowcaseOutro variant={variants.outro}>
              {/* The 4:5 frame closes on the word's reactions rising off the canvas, over the
                  veil and behind the address bar. */}
              {search.frame === "4x5" && <ShowcaseEmojiFlight wordId={word.id} />}
            </ShowcaseOutro>
          )}
        </div>
      </main>
    </DeckLocaleContext.Provider>
  );
}

/** The opening badge. Markup only; the timeline is in vocabulary.css. */
function ShowcaseIntro({ text, variant }: { text: string; variant: ShowcaseIntroVariant }) {
  return (
    <div className="vocab-intro" data-intro={variant}>
      <div className="vocab-intro-veil" />
      <div className="vocab-intro-ring" />
      <div className="vocab-intro-confetti">
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="vocab-intro-badge">{text}</div>
    </div>
  );
}

/**
 * The opening question that stays (4:5 frame only), in one of the feed badge's looks.
 * Markup only: vocabulary-export.css pops it in full size, then shrinks it into the
 * top-left corner, where it stays.
 */
function ShowcaseHook({ text, look }: { text: string; look: BadgeVariant }) {
  return (
    <div className="vocab-showcase-hook" data-look={look} aria-hidden="true">
      <div className="vocab-showcase-hook-card">
        <span className="vocab-showcase-hook-text">{text}</span>
      </div>
    </div>
  );
}

/** How many emojis fly at the end, per word: 15 to 20, fixed for the word. */
const FLIGHT_MIN = 15;
const FLIGHT_SPREAD = 6;

/**
 * The 4:5 frame's closing reactions: the feed's own emoji smoke (EmojiBurst), 15-20 of the
 * word's reaction emojis billowing out of one point at the bottom middle of the canvas and
 * spreading to both sides as they rise and fade, at the feed's sizes and opacity. The mix
 * is the word's mocked reactions softened (square root, plus a floor), so all six emojis
 * fly and the word's favourite still leads, rather than one emoji taking most of the 15-20.
 */
function ShowcaseEmojiFlight({ wordId }: { wordId: string }) {
  const totals = useMemo<EmojiTotals>(() => {
    const crowd = mockEmojiTotals(wordId).counts;
    const ranked = EMOJI_PALETTE.map((emoji) => ({
      emoji,
      count: Math.round(Math.sqrt(crowd[emoji] ?? 0)) + 3,
    })).sort((a, b) => b.count - a.count);
    return {
      counts: Object.fromEntries(ranked.map((item) => [item.emoji, item.count])),
      total: ranked.reduce((sum, item) => sum + item.count, 0),
      ranked,
    };
  }, [wordId]);
  const limit = useMemo(() => {
    let hash = 0;
    for (const char of wordId) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
    return FLIGHT_MIN + (hash % FLIGHT_SPREAD);
  }, [wordId]);
  const width = typeof window === "undefined" ? 432 : window.innerWidth;
  const height = typeof window === "undefined" ? 768 : window.innerHeight;
  // The 4:5 canvas's foot: the band under it is (height - 1.25 × width) / 2.
  const band = Math.max(0, (height - width * 1.25) / 2);
  return (
    <EmojiBurst
      wordId={wordId}
      totals={totals}
      width={width}
      height={height}
      origins={{}}
      originX={width / 2}
      originY={height - band - 28}
      spanSeconds={cssDuration("--outro-dur", 4600) / 1000}
      reducedMotion={false}
      limit={limit}
    />
  );
}

/** The end card. Markup only; the timeline is in vocabulary.css. */
function ShowcaseOutro({
  variant,
  children,
}: {
  variant: ShowcaseOutroVariant;
  /** Drawn between the veil and the address bar, so the bar stays on top of it. */
  children?: React.ReactNode;
}) {
  const address = siteAddress(useContext(DeckLocaleContext));
  return (
    <div className="vocab-outro" data-outro={variant}>
      <div className="vocab-outro-veil" />
      {children}
      <div className="vocab-outro-bar">
        <span className="vocab-outro-lock" />
        <span className="vocab-outro-url">{address}</span>
        <span className="vocab-outro-caret" />
      </div>
    </div>
  );
}
